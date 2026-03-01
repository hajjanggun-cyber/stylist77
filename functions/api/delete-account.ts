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

  const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 토큰으로 유저 확인
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    // 1. 유저 관련 데이터 먼저 삭제 (외래키 제약 방지)
    const { error: paymentsDeleteError } = await supabase.from('payments').delete().eq('user_id', user.id)
    if (paymentsDeleteError) {
      console.error('Failed to delete user payments:', paymentsDeleteError)
      // 결제 기록 삭제 실패해도 계속 진행하거나 에러를 반환할 수 있음. 일단 계속 진행 시도
    }

    // 2. 관리자 권한으로 유저 삭제
    // 주의: ctx.env.SUPABASE_SERVICE_KEY 가 'service_role' 키여야 함
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
    
    if (deleteError) {
      console.error('Supabase admin delete error:', deleteError)
      return new Response(
        JSON.stringify({ 
          error: deleteError.message || 'Admin delete failed',
          details: deleteError 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('Delete account exception:', e)
    return new Response(
      JSON.stringify({ 
        error: e?.message || 'Server Exception',
        stack: e?.stack 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
