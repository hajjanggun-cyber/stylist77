import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const authHeader = ctx.request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')

  const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_KEY)

  // 토큰으로 유저 확인
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // 유저 관련 데이터 먼저 삭제 (외래키 제약 방지)
  await supabase.from('payments').delete().eq('user_id', user.id)

  // 관리자 권한으로 유저 삭제
  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
