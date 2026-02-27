interface Env {
  POLAR_ACCESS_TOKEN: string
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const checkoutId = url.searchParams.get('checkout_id')

  if (!checkoutId) {
    return new Response(JSON.stringify({ error: 'checkout_id required' }), { status: 400 })
  }

  // 1) checkout 상태 확인
  const checkoutRes = await fetch(`https://api.polar.sh/v1/checkouts/${checkoutId}`, {
    headers: { 'Authorization': `Bearer ${ctx.env.POLAR_ACCESS_TOKEN}` },
  })
  const checkout = await checkoutRes.json() as {
    status?: string
    order?: { id: string }
    order_id?: string
  }

  const confirmed = checkout.status === 'confirmed' || checkout.status === 'succeeded'
  if (!confirmed) {
    return new Response(JSON.stringify({ paid: false }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2) order_id 추출 후 order 실제 확인
  const orderId = checkout.order?.id ?? checkout.order_id
  if (!orderId) {
    return new Response(JSON.stringify({ paid: true, orderId: null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const orderRes = await fetch(`https://api.polar.sh/v1/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${ctx.env.POLAR_ACCESS_TOKEN}` },
  })
  const order = await orderRes.json() as { id: string }

  return new Response(JSON.stringify({ paid: true, orderId: order.id }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
