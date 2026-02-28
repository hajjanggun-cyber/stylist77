import { createClient } from '@supabase/supabase-js'

interface Env {
  POLAR_ACCESS_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const checkoutId = url.searchParams.get('checkout_id')

  if (!checkoutId) {
    return new Response(JSON.stringify({ error: 'checkout_id required' }), { status: 400 })
  }

  // 1) Auth: JWT 검증
  const authHeader = ctx.request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // 2) checkout 상태 확인
  const checkoutRes = await fetch(`https://api.polar.sh/v1/checkouts/${checkoutId}`, {
    headers: { 'Authorization': `Bearer ${ctx.env.POLAR_ACCESS_TOKEN}` },
  })
  const checkout = await checkoutRes.json() as {
    status?: string
    order?: { id: string, amount: number }
    order_id?: string
  }

  const confirmed = checkout.status === 'confirmed' || checkout.status === 'succeeded'
  if (!confirmed) {
    return new Response(JSON.stringify({ paid: false }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3) order_id 추출 후 order 실제 확인
  const orderId = checkout.order?.id ?? checkout.order_id
  if (!orderId) {
    return new Response(JSON.stringify({ paid: true, orderId: null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orderRes = await fetch(`https://api.polar.sh/v1/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${ctx.env.POLAR_ACCESS_TOKEN}` },
  })
  const order = await orderRes.json() as { id: string, amount: number }

  // 4) Supabase payments 테이블에 결제 내역 저장
  // 동일한 checkout_id나 order_id로 중복 삽입되는 것을 방지 (DB의 unique 제약조건 의존 또는 upsert 활용)
  const { error: insertError } = await supabase
    .from('payments')
    .upsert({
      user_id: user.id,
      order_id: order.id,
      checkout_id: checkoutId,
      amount: order.amount || 399 // fallback
    }, { onConflict: 'order_id' })

  if (insertError) {
    console.error('Payment insert error:', insertError)
    // DB 저장 실패 시 프론트엔드에 알림. 실제 프로덕션에서는 결제는 성공했으나 DB 반영 실패 건에 대한 로깅/슬랙 알림 등이 필요함.
  }

  return new Response(JSON.stringify({ paid: true, orderId: order.id }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
