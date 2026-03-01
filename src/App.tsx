import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import html2canvas from 'html2canvas'
import { supabase } from './lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import './App.css'

type Page = 'landing' | 'auth' | 'form' | 'mypage'
type StyleGoalId = 'casual' | 'formal' | 'trendy' | 'date'

interface StyleGoalOption {
  id: StyleGoalId
  icon: string
}

const STYLE_GOALS: StyleGoalOption[] = [
  { id: 'casual', icon: 'check_circle' },
  { id: 'formal', icon: 'business_center' },
  { id: 'trendy', icon: 'auto_awesome' },
  { id: 'date', icon: 'favorite' },
]

function App() {
  const { t } = useTranslation()
  const [page, setPage] = useState<Page>('landing')

  // ── Auth 상태 ──
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoginMode, setIsLoginMode] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  // ── 마이페이지 상태 ──
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false)
  const [passwordUpdateMsg, setPasswordUpdateMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // ── 폼 상태 ──
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [styleGoal, setStyleGoal] = useState<StyleGoalId>('casual')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [hairstyleImage, setHairstyleImage] = useState<string | null>(null)
  const [hasPaid, setHasPaid] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [analysisSuccess, setAnalysisSuccess] = useState(false)

  // ── 채팅 상태 ──
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const pendingAnalysisRef = useRef<{ height: string; weight: string; styleGoal: StyleGoalId; image: string | null } | null>(null)

  // ── 앱 시작: 세션 확인 + 결제 리다이렉트 처리 ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s)
      setUser(s?.user ?? null)

      const params = new URLSearchParams(window.location.search)
      const checkoutId = params.get('checkout_id')
      if (!checkoutId || !s) return

      setVerifying(true)
      fetch(`/api/verify-checkout?checkout_id=${checkoutId}`, {
        headers: { 'Authorization': `Bearer ${s.access_token}` },
      })
        .then(r => r.json())
        .then((data: { paid: boolean }) => {
          if (!data.paid) return
          window.history.replaceState({}, '', '/')

          const raw = localStorage.getItem('aura_pending_form')
          if (raw) {
            try {
              const saved = JSON.parse(raw) as { height: string; weight: string; styleGoal: StyleGoalId }
              setHeight(saved.height)
              setWeight(saved.weight)
              setStyleGoal(saved.styleGoal)
              localStorage.removeItem('aura_pending_form')
              const savedImage = localStorage.getItem('aura_pending_image')
              if (savedImage) {
                setSelectedImage(savedImage)
                localStorage.removeItem('aura_pending_image')
              }
              pendingAnalysisRef.current = { ...saved, image: savedImage }
            } catch { }
          }
          setHasPaid(true)
        })
        .catch(() => { })
        .finally(() => setVerifying(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, s: Session | null) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (event === 'SIGNED_IN') {
        const params = new URLSearchParams(window.location.search)
        if (!params.get('checkout_id')) {
          setPage('form')
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // hasPaid + pendingAnalysisRef → 자동 분석
  useEffect(() => {
    if (!hasPaid || !pendingAnalysisRef.current) return
    const saved = pendingAnalysisRef.current
    pendingAnalysisRef.current = null
    setPage('form')
    runAnalysis(saved.height, saved.weight, saved.styleGoal, saved.image)
  }, [hasPaid])

  // 채팅 스크롤 처리
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── Supabase 미사용 결제 확인 ──
  const checkPaymentStatus = async (): Promise<boolean> => {
    if (!user) return false
    const { data, error } = await supabase
      .from('payments')
      .select('id')
      .is('used_at', null)
      .limit(1)
    return !error && !!data && data.length > 0
  }

  // ── Auth 핸들러 ──
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    if (!authEmail || !authPassword || (!isLoginMode && !authPasswordConfirm)) {
      setAuthError(t('auth.error_empty'))
      return
    }
    if (!isLoginMode && authPassword !== authPasswordConfirm) {
      setAuthError(t('auth.error_password_mismatch'))
      return
    }
    setAuthSubmitting(true)
    try {
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        if (error) throw error
        setPage('form')
      } else {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword })
        if (error) throw error
        if (data?.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error(t('auth.error_already_registered'))
        }
        setAuthSuccess(t('auth.success_signup'))
        setAuthEmail('')
        setAuthPassword('')
        setAuthPasswordConfirm('')
      }
    } catch (err: any) {
      let errorMessage = t('auth.error_auth')
      if (err?.message) {
        const msg = err.message
        if (msg.includes('Invalid login credentials')) errorMessage = t('auth.error_invalid_credentials')
        else if (msg.includes('User already registered')) errorMessage = t('auth.error_already_registered')
        else if (msg.includes('Password should be at least')) errorMessage = t('auth.error_password_length')
        else if (msg.includes('rate limit')) errorMessage = t('auth.error_rate_limit')
        else errorMessage = msg
      }
      setAuthError(errorMessage)
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handlePasswordUpdate = async () => {
    if (!newPassword || !newPasswordConfirm) { setPasswordUpdateMsg(t('mypage.error_empty')); return }
    if (newPassword !== newPasswordConfirm) { setPasswordUpdateMsg(t('mypage.error_mismatch')); return }
    if (newPassword.length < 6) { setPasswordUpdateMsg(t('mypage.error_too_short')); return }
    setPasswordUpdateLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordUpdateMsg(error.message)
    } else {
      setPasswordUpdateMsg(t('mypage.password_updated'))
      setNewPassword('')
      setNewPasswordConfirm('')
    }
    setPasswordUpdateLoading(false)
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${s?.access_token}` },
      })
      if (res.ok) {
        await supabase.auth.signOut()
        setPage('landing')
        setDeleteConfirm(false)
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(data.error || t('mypage.delete_error'))
      }
    } catch {
      alert(t('mypage.delete_error'))
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setAuthError(error.message)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setShowUserMenu(false)
    setPage('landing')
    setResult('')
    setHairstyleImage(null)
    setAnalysisSuccess(false)
    setHasPaid(false)
    setChatMessages([])
    setChatInput('')
  }

  const goToLanding = () => {
    setShowUserMenu(false)
    setDeleteConfirm(false)
    setPasswordUpdateMsg('')
    setPage('landing')
    setResult('')
    setHairstyleImage(null)
    setHeight('')
    setWeight('')
    setSelectedImage(null)
    setAnalysisSuccess(false)
    setHasPaid(false)
    setChatMessages([])
    setChatInput('')
  }

  // ── 파일 처리 ──
  const processFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => setSelectedImage(e.target?.result as string)
    reader.readAsDataURL(file)
  }
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0])
  }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0])
  }

  // ── 분석 실행 ──
  const runAnalysis = async (h: string, w: string, sg: StyleGoalId, img: string | null) => {
    setLoading(true)
    setResult('')
    setHairstyleImage(null)
    const lang = i18n.language.startsWith('ko') ? 'ko' : 'en'

    const { data: { session: freshSession } } = await supabase.auth.getSession()
    if (!freshSession) {
      setResult(t('error.networkError'))
      setLoading(false)
      return
    }

    try {
      const goalValue = t(`styleGoalValue.${sg}`)
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshSession.access_token}`,
        },
        body: JSON.stringify({ height: h, weight: w, styleGoal: goalValue, imageBase64: img || undefined, lang }),
      })
      const data = await response.json() as { result?: string; error?: string; hairstyleImage?: string }

      if (response.status === 402) {
        setHasPaid(false)
        return
      }
      if (!response.ok || data.error) {
        setResult(`오류: ${data.error || '알 수 없는 오류'}`)
        return
      }
      setResult(data.result || t('result.noResult'))
      setHairstyleImage(data.hairstyleImage || null)
      setAnalysisSuccess(true)
      setHasPaid(false)
    } catch {
      setResult(t('error.networkError'))
      setAnalysisSuccess(false)
    } finally {
      setLoading(false)
    }
  }

  // ── 채팅 핸들러 ──
  const handleSendChat = async () => {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setIsChatLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: chatMessages,
          message: userMsg,
          context: result,
        }),
      })
      const data = await response.json() as { reply?: string; error?: string }
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'model', content: data.reply! }])
      } else {
        alert(data.error || 'Chat error')
      }
    } catch {
      alert('Network error')
    } finally {
      setIsChatLoading(false)
    }
  }

  // ── 분석 버튼 클릭 ──
  const analyzeStyle = async () => {
    if (!height || !weight) { alert(t('error.noMeasurements')); return }

    if (!session) {
      setPage('auth')
      return
    }

    if (!hasPaid) {
      const paid = await checkPaymentStatus()
      if (paid) {
        setHasPaid(true)
        await runAnalysis(height, weight, styleGoal, selectedImage)
        return
      }

      localStorage.setItem('aura_pending_form', JSON.stringify({ height, weight, styleGoal }))
      if (selectedImage) {
        try { localStorage.setItem('aura_pending_image', selectedImage) } catch { }
      }
      setLoading(true)
      try {
        const successUrl = `${window.location.origin}/?checkout_id={CHECKOUT_ID}`
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ successUrl }),
        })
        const data = await res.json() as { checkoutUrl?: string; error?: string }
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl
        } else {
          alert(t('error.checkoutError'))
          setLoading(false)
        }
      } catch {
        alert(t('error.checkoutError'))
        setLoading(false)
      }
      return
    }

    await runAnalysis(height, weight, styleGoal, selectedImage)
  }

  const saveAsImage = async () => {
    if (!resultRef.current) return
    setSaving(true)
    try {
      const canvas = await html2canvas(resultRef.current, { backgroundColor: '#10221d', scale: 2, useCORS: true, allowTaint: true, logging: false })
      const link = document.createElement('a')
      link.download = 'aura-style-report.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) { console.error('Save failed:', e) }
    finally { setSaving(false) }
  }

  const shareResult = async () => {
    if (!resultRef.current) return
    setSharing(true)
    try {
      const canvas = await html2canvas(resultRef.current, { backgroundColor: '#10221d', scale: 2, useCORS: true, allowTaint: true, logging: false })
      canvas.toBlob(async (blob) => {
        if (!blob) { setSharing(false); return }
        const file = new File([blob], 'aura-style-report.png', { type: 'image/png' })
        try {
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: t('share.title'), text: t('share.text'), files: [file] })
          } else if (navigator.share) {
            await navigator.share({ title: t('share.title'), text: result })
          } else {
            await navigator.clipboard.writeText(result)
            alert(t('error.clipboardCopied'))
          }
        } catch { }
        setSharing(false)
      })
    } catch { setSharing(false) }
  }

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language.startsWith('ko') ? 'en' : 'ko')
  }

  const btnStyle = {
    background: 'none' as const,
    border: '1px solid #ccc',
    color: '#333',
    fontSize: 12,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 20,
    cursor: 'pointer' as const,
    letterSpacing: '0.05em',
  }

  // ══════════════════════════════════════════
  // ── Auth Page ──
  // ══════════════════════════════════════════
  if (page === 'auth') {
    return (
      <div className="app">
        <div className="landing" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <header className="landing__header">
            <span className="landing__logo-text" onClick={() => setPage('landing')} style={{ cursor: 'pointer' }}>AURA</span>
            <button onClick={toggleLang} style={btnStyle}>
              {i18n.language.startsWith('ko') ? 'EN' : '한국어'}
            </button>
          </header>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
            <div style={{ width: '100%', maxWidth: 400 }}>
              {/* 헤딩 */}
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
                  {isLoginMode ? t('auth.heading_login') : t('auth.heading_signup')}
                </h2>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: '#888' }}>
                  {isLoginMode ? t('auth.subheading_login') : t('auth.subheading_signup')}
                </p>
              </div>

              {/* 탭 */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: 28 }}>
                {(['login', 'signup'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setIsLoginMode(tab === 'login'); setAuthError(''); setAuthSuccess('') }}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: (isLoginMode ? tab === 'login' : tab === 'signup') ? '2px solid #111' : '2px solid transparent',
                      fontSize: 15,
                      fontWeight: (isLoginMode ? tab === 'login' : tab === 'signup') ? 700 : 400,
                      color: (isLoginMode ? tab === 'login' : tab === 'signup') ? '#111' : '#888',
                      cursor: 'pointer',
                      marginBottom: -1,
                    }}
                  >
                    {tab === 'login' ? t('auth.login') : t('auth.signup')}
                  </button>
                ))}
              </div>

              {/* Google 로그인 버튼 */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: '11px 16px',
                  background: '#fff',
                  border: '1px solid #dadce0',
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#3c4043',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  boxSizing: 'border-box',
                  marginBottom: 4,
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t('auth.google_login')}
              </button>

              {/* OR 구분선 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>{t('auth.or')}</span>
                <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
              </div>

              {/* 폼 */}
              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#555', letterSpacing: '0.05em' }}>
                    {t('auth.email').toUpperCase()}
                  </label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="metric-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#555', letterSpacing: '0.05em' }}>
                    {t('auth.password').toUpperCase()}
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="metric-input"
                    style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '32px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#888',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
                {!isLoginMode && (
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#555', letterSpacing: '0.05em' }}>
                      {t('auth.password_confirm').toUpperCase()}
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={authPasswordConfirm}
                      onChange={e => setAuthPasswordConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="metric-input"
                      style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '32px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#888',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                )}

                {authError && (
                  <p style={{ margin: 0, fontSize: 13, color: '#e53e3e' }}>{authError}</p>
                )}
                {authSuccess && (
                  <div style={{ margin: 0, padding: '12px', fontSize: 13, color: '#047857', backgroundColor: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '4px', textAlign: 'center', lineHeight: '1.5' }}>
                    {authSuccess.split('\n').map((line, i) => (
                      <span key={i}>{line}<br/></span>
                    ))}
                  </div>
                )}

                <button type="submit" className="landing__cta" disabled={authSubmitting} style={{ marginTop: 4 }}>
                  {authSubmitting
                    ? <><span className="loader" style={{ borderTopColor: '#fff' }} />&nbsp;{t('auth.submit')}</>
                    : isLoginMode ? t('auth.login') : t('auth.signup')
                  }
                </button>

              </form>

              <button
                onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); setAuthSuccess('') }}
                style={{ width: '100%', marginTop: 20, background: 'none', border: 'none', color: '#666', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {isLoginMode ? t('auth.switch_to_signup') : t('auth.switch_to_login')}
              </button>

              <button
                onClick={() => setPage('landing')}
                style={{ width: '100%', marginTop: 12, background: 'none', border: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer' }}
              >
                ← {t('auth.back')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  // ── My Page ──
  // ══════════════════════════════════════════
  if (page === 'mypage') {
    const isEmailUser = user?.app_metadata?.provider === 'email'
    const joinDate = user?.created_at
      ? new Date(user.created_at).toLocaleDateString(
          i18n.language.startsWith('ko') ? 'ko-KR' : 'en-US',
          { year: 'numeric', month: 'long', day: 'numeric' }
        )
      : '-'

    const cardStyle: React.CSSProperties = {
      background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 20, marginBottom: 16,
    }
    const sectionLabelStyle: React.CSSProperties = {
      margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em',
    }
    const rowStyle: React.CSSProperties = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }
    const dividerStyle: React.CSSProperties = { height: 1, background: '#f0f0f0', margin: '10px 0' }

    return (
      <div className="app">
        <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
          <header className="landing__header" style={{ background: '#fff', borderBottom: '1px solid #ebebeb', position: 'sticky', top: 0, zIndex: 10 }}>
            <span className="landing__logo-text" onClick={goToLanding} style={{ cursor: 'pointer' }}>AURA</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={toggleLang} style={btnStyle}>{i18n.language.startsWith('ko') ? 'EN' : '한국어'}</button>
              {user && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowUserMenu(v => !v)}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: '#111', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {user.email?.[0].toUpperCase()}
                  </button>
                  {showUserMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowUserMenu(false)} />
                      <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 220, zIndex: 100, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                          <p style={{ margin: 0, fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('auth.signed_in_as')}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#111', wordBreak: 'break-all' }}>{user.email}</p>
                        </div>
                        <button
                          onClick={() => { setShowUserMenu(false); setPasswordUpdateMsg(''); setDeleteConfirm(false); setPage('mypage') }}
                          style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#111', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>manage_accounts</span>
                          {t('mypage.title')}
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); handleLogout() }}
                          style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#e53e3e', cursor: 'pointer', fontWeight: 500, borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
                          {t('auth.logout')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </header>

          <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px 60px' }}>
            <button
              onClick={() => setPage(session ? 'form' : 'landing')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', padding: '0 0 20px', fontWeight: 500 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              {t('mypage.back')}
            </button>
            <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
              {t('mypage.title')}
            </h1>

            {/* 내 정보 */}
            <div style={cardStyle}>
              <h3 style={sectionLabelStyle}>{t('mypage.my_info')}</h3>
              <div style={rowStyle}>
                <span style={{ fontSize: 13, color: '#666' }}>{t('mypage.email')}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111', wordBreak: 'break-all', textAlign: 'right', maxWidth: '60%' }}>{user?.email}</span>
              </div>
              <div style={dividerStyle} />
              <div style={rowStyle}>
                <span style={{ fontSize: 13, color: '#666' }}>{t('mypage.joined')}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{joinDate}</span>
              </div>
              <div style={dividerStyle} />
              <div style={rowStyle}>
                <span style={{ fontSize: 13, color: '#666' }}>{t('mypage.provider')}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                  {isEmailUser ? t('mypage.provider_email') : t('mypage.provider_google')}
                </span>
              </div>
            </div>

            {/* 비밀번호 변경 */}
            <div style={cardStyle}>
              <h3 style={sectionLabelStyle}>{t('mypage.change_password')}</h3>
              {isEmailUser ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#555', letterSpacing: '0.05em' }}>
                      {t('mypage.new_password').toUpperCase()}
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => { setNewPassword(e.target.value); setPasswordUpdateMsg('') }}
                      placeholder="••••••••"
                      className="metric-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#555', letterSpacing: '0.05em' }}>
                      {t('mypage.confirm_password').toUpperCase()}
                    </label>
                    <input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={e => { setNewPasswordConfirm(e.target.value); setPasswordUpdateMsg('') }}
                      placeholder="••••••••"
                      className="metric-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  {passwordUpdateMsg && (
                    <p style={{ margin: 0, fontSize: 13, color: passwordUpdateMsg === t('mypage.password_updated') ? '#047857' : '#e53e3e' }}>
                      {passwordUpdateMsg}
                    </p>
                  )}
                  <button onClick={handlePasswordUpdate} disabled={passwordUpdateLoading} className="landing__cta" style={{ marginTop: 4 }}>
                    {passwordUpdateLoading
                      ? <><span className="loader" style={{ borderTopColor: '#fff' }} />&nbsp;{t('mypage.update_btn')}</>
                      : t('mypage.update_btn')
                    }
                  </button>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#888', lineHeight: 1.6 }}>{t('mypage.oauth_no_password')}</p>
              )}
            </div>

            {/* 계정 탈퇴 */}
            <div style={{ ...cardStyle, border: '1px solid #ffe0e0', marginBottom: 0 }}>
              <h3 style={{ ...sectionLabelStyle, color: '#e53e3e' }}>{t('mypage.delete_account')}</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888', lineHeight: 1.6 }}>{t('mypage.delete_warning')}</p>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  style={{ padding: '10px 20px', background: 'none', border: '1px solid #e53e3e', color: '#e53e3e', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('mypage.delete_btn')}
                </button>
              ) : (
                <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: 16 }}>
                  <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, color: '#c53030' }}>
                    {t('mypage.delete_confirm_prompt')}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      style={{ flex: 1, padding: '10px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#666', cursor: 'pointer' }}
                    >
                      {t('mypage.delete_cancel')}
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteLoading}
                      style={{ flex: 1, padding: '10px', background: '#e53e3e', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {deleteLoading
                        ? <span className="loader" style={{ borderTopColor: '#fff', width: 16, height: 16 }} />
                        : t('mypage.delete_confirm_btn')
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  // ── Landing Page ──
  // ══════════════════════════════════════════
  if (page === 'landing') {
    return (
      <div className="app">
        <div className="landing">
          <header className="landing__header">
            <span className="landing__logo-text">AURA</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={toggleLang} style={btnStyle} aria-label="Switch language">
                {i18n.language.startsWith('ko') ? 'EN' : '한국어'}
              </button>
              {user ? (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowUserMenu(v => !v)}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: '#111', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {user.email?.[0].toUpperCase()}
                  </button>
                  {showUserMenu && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowUserMenu(false)} />
                      <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 220, zIndex: 100, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                          <p style={{ margin: 0, fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('auth.signed_in_as')}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#111', wordBreak: 'break-all' }}>{user.email}</p>
                        </div>
                        <button
                          onClick={() => { setShowUserMenu(false); setPasswordUpdateMsg(''); setDeleteConfirm(false); setPage('mypage') }}
                          style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#111', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>manage_accounts</span>
                          {t('mypage.title')}
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); handleLogout() }}
                          style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#e53e3e', cursor: 'pointer', fontWeight: 500, borderTop: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
                          {t('auth.logout')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button onClick={() => setPage('auth')} style={btnStyle}>{t('auth.login')}</button>
              )}
              <button className="landing__header-menu" aria-label={t('landing.menu')}>
                <span className="material-symbols-outlined">menu</span>
              </button>
            </div>
          </header>

          <div className="landing__hero">
            <img
              className="landing__hero-img"
              src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=480&q=90&fit=crop&crop=top"
              alt="Fashion editorial"
            />
            <div className="landing__hero-overlay">
              <div className="landing__hero-tag">
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>auto_awesome</span>
                AI PERSONAL STYLIST
              </div>
              <h1 className="landing__title">
                <span className="landing__title-small">{t('landing.title')}</span>
                <span className="landing__title-serif">{t('landing.subtitle')}</span>
                <span className="landing__title-amp">AI PERSONAL STYLIST</span>
              </h1>
            </div>
          </div>

          <main className="landing__main">
            <p className="landing__desc">
              {t('landing.desc').split('\n').map((line, i) => (
                <span key={i}>{line}{i < t('landing.desc').split('\n').length - 1 && <br />}</span>
              ))}
            </p>

            <div className="landing__features">
              {[
                { icon: 'accessibility_new', key: 'bodyAnalysis' },
                { icon: 'color_lens', key: 'colorPalette' },
                { icon: 'face_retouching_natural', key: 'hairRecommendation' },
              ].map(f => (
                <div className="landing__feature" key={f.key}>
                  <div className="landing__feature-icon-wrap">
                    <span className="material-symbols-outlined">{f.icon}</span>
                  </div>
                  <span className="landing__feature-label">{t(`landing.feature.${f.key}`)}</span>
                </div>
              ))}
            </div>

            {verifying ? (
              <button className="landing__cta" disabled>
                <span className="loader" style={{ borderTopColor: '#fff' }} />&nbsp;{t('landing.verifying')}
              </button>
            ) : (
              <button className="landing__cta" onClick={() => setPage(session ? 'form' : 'auth')}>
                {t('landing.cta')}
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            )}

            <p className="landing__note">{t('landing.note')}</p>

            <div className="landing__legal">
              <a href="/terms.html">{t('landing.terms')}</a>
              <span className="landing__legal-dot">·</span>
              <a href="/refund.html">{t('landing.refund')}</a>
              <span className="landing__legal-dot">·</span>
              <a href="/privacy.html">{t('landing.privacy')}</a>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════
  // ── Form / Result Page ──
  // ══════════════════════════════════════════
  return (
    <div className="app">
      {loading && (
        <div className="scan-overlay">
          <div className="scan-card">
            <div className="scan-card__bg">
              {selectedImage
                ? <img src={selectedImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4, filter: 'grayscale(0.5)' }} />
                : <span className="material-symbols-outlined scan-card__icon">person</span>
              }
            </div>
            <div className="scan-line" />
            <div className="scan-badge">ANALYZING FEATURES</div>
          </div>
          <p className="scan-text">
            {t('scan.text').split('\n').map((line, i) => (
              <span key={i}>{line}{i < t('scan.text').split('\n').length - 1 && <br />}</span>
            ))}
          </p>
          <div className="scan-dots">
            <div className="scan-dot" />
            <div className="scan-dot" />
            <div className="scan-dot" />
          </div>
        </div>
      )}

      <div className="form-hero">
        <img
          className="form-hero__img"
          src="https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=480&q=85&fit=crop&crop=top"
          alt=""
        />
        <div className="form-hero__overlay">
          <button className="form-hero__back" onClick={goToLanding} aria-label={t('form.back')}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="form-hero__text">
            <p className="form-hero__tag">{t('form.tag')}</p>
            <h2 className="form-hero__title">{t('form.title')}</h2>
            <p className="form-hero__sub">{t('form.subtitle')}</p>
          </div>
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={toggleLang}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', backdropFilter: 'blur(4px)' }}
              aria-label="Switch language"
            >
              {i18n.language.startsWith('ko') ? 'EN' : '한국어'}
            </button>
            {user && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', color: '#111', border: '1px solid rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                >
                  {user.email?.[0].toUpperCase()}
                </button>
                {showUserMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowUserMenu(false)} />
                    <div style={{ position: 'absolute', right: 0, top: 40, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', minWidth: 220, zIndex: 100, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <p style={{ margin: 0, fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('auth.signed_in_as')}</p>
                        <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: '#111', wordBreak: 'break-all' }}>{user.email}</p>
                      </div>
                      <button
                        onClick={() => { setShowUserMenu(false); handleLogout() }}
                        style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#e53e3e', cursor: 'pointer', fontWeight: 500 }}
                      >
                        {t('auth.logout')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="main">
        <section className="section-hero">
          <h1 className="section-hero__title">
            {t('form.sectionTitle').split('\n').map((line, i) => (
              <span key={i}>{line}{i < t('form.sectionTitle').split('\n').length - 1 && <br />}</span>
            ))}
          </h1>
          <p className="section-hero__sub">
            {t('form.sectionDesc').split('\n').map((line, i) => (
              <span key={i}>{line}{i < t('form.sectionDesc').split('\n').length - 1 && <br />}</span>
            ))}
          </p>
        </section>

        <section className="section-upload">
          <div
            className={`upload-zone${isDragging ? ' upload-zone--drag' : ''}${selectedImage ? ' upload-zone--filled' : ''}`}
            onDragOver = {onDragOver}
            onDragLeave = {onDragLeave}
            onDrop = {onDrop}
            onClick={() => !selectedImage && fileInputRef.current?.click()}
          >
            {selectedImage ? (
              <>
                <img src={selectedImage} alt={t('form.preview')} className="upload-zone__preview" />
                <button
                  className="upload-zone__remove"
                  onClick={(e) => { e.stopPropagation(); setSelectedImage(null) }}
                  aria-label={t('form.removePhoto')}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </>
            ) : (
              <>
                <div className="upload-zone__icon-wrap">
                  <span className="material-symbols-outlined upload-zone__icon">photo_camera</span>
                </div>
                <p className="upload-zone__title">{t('form.upload')}</p>
                <p className="upload-zone__sub">{t('form.uploadHint')}</p>
                <button
                  className="upload-zone__btn"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                >
                  {t('form.selectPhoto')}
                </button>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} hidden />
        </section>

        <section className="section-metrics">
          <div className="metrics-grid">
            <div className="metric-field">
              <label className="metric-label" htmlFor="height">{t('form.height')}</label>
              <input id="height" className="metric-input" type="number" placeholder="175" value={height} onChange={e => setHeight(e.target.value)} />
            </div>
            <div className="metric-field">
              <label className="metric-label" htmlFor="weight">{t('form.weight')}</label>
              <input id="weight" className="metric-input" type="number" placeholder="70" value={weight} onChange={e => setWeight(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="section-goal">
          <label className="goal-label">{t('form.styleGoal')}</label>
          <div className="goal-grid">
            {STYLE_GOALS.map(g => (
              <button
                key={g.id}
                className={`goal-btn${styleGoal === g.id ? ' goal-btn--active' : ''}`}
                onClick={() => setStyleGoal(g.id)}
              >
                <span className="material-symbols-outlined goal-btn__icon">{g.icon}</span>
                <span className="goal-btn__label">{t(`styleGoal.${g.id}`)}</span>
              </button>
            ))}
          </div>
        </section>

        {result && (
          <section ref={resultRef} className="section-result">
            <div className="result__header">
              <span className="material-symbols-outlined">auto_awesome</span>
              <span>Style Dossier</span>
              <span className="result__dossier-tag">AI Report</span>
            </div>
            <div className="result__body">
              {result.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
            {hairstyleImage && (
              <div className="result__hairstyle">
                <p className="result__hairstyle-title">
                  <span className="material-symbols-outlined">content_cut</span>
                  {t('result.hairstyleTitle')}
                </p>
                <img src={hairstyleImage} alt={t('result.hairstyleAlt')} className="result__hairstyle-img" />
              </div>
            )}

            {/* Chat with Stylist Section */}
            <div className="result__chat">
              <div className="chat__header">
                <span className="material-symbols-outlined">chat_bubble</span>
                <span>Ask Aura (Follow-up)</span>
              </div>
              <div className="chat__messages">
                {chatMessages.length === 0 && (
                  <p className="chat__empty">Have a follow-up question about your report? Ask Aura below!</p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`chat__message chat__message--${msg.role}`}>
                    {msg.content}
                  </div>
                ))}
                {isChatLoading && <div className="chat__message chat__message--model loader-chat" />}
                <div ref={chatEndRef} />
              </div>
              <div className="chat__input-group">
                <input
                  type="text"
                  className="chat__input"
                  placeholder="Ask about items, colors, or tips..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  disabled={isChatLoading}
                />
                <button className="chat__send-btn" onClick={handleSendChat} disabled={isChatLoading}>
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {analysisSuccess && (
          <section className="result-actions">
            <button className="result-action-btn" onClick={saveAsImage} disabled={saving || sharing}>
              <span className="material-symbols-outlined">download</span>
              {saving ? t('button.saving') : t('button.save')}
            </button>
            <button className="result-action-btn result-action-btn--share" onClick={shareResult} disabled={saving || sharing}>
              <span className="material-symbols-outlined">share</span>
              {sharing ? t('button.sharing') : t('button.share')}
            </button>
            <button
              className="result-action-btn"
              style={{ gridColumn: '1 / -1', background: 'none', border: '1px solid #444', color: '#aaa' }}
              onClick={goToLanding}
              disabled={saving || sharing}
            >
              <span className="material-symbols-outlined">home</span>
              {t('button.home')}
            </button>
          </section>
        )}

        {!analysisSuccess && (
          <section className="section-cta">
            <button className="cta-btn" onClick={analyzeStyle} disabled={loading}>
              {loading
                ? <><span className="loader" />&nbsp;{hasPaid ? t('button.analyzing') : t('button.redirecting')}</>
                : hasPaid ? t('button.analyze') : t('button.analyzeWithPayment')
              }
            </button>
            <p className="cta-note">
              {hasPaid ? t('cta.noteAfterPaid') : t('cta.noteBefore')}
            </p>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <a className="bottom-nav__item" href="#" onClick={(e) => { e.preventDefault(); goToLanding() }}>
          <span className="material-symbols-outlined">home</span>
          <span className="bottom-nav__label">{t('nav.home')}</span>
        </a>
        <a className="bottom-nav__item bottom-nav__item--active" href="#">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
          <span className="bottom-nav__label">{t('nav.analyze')}</span>
        </a>
        <a className="bottom-nav__item" href="#">
          <span className="material-symbols-outlined">checkroom</span>
          <span className="bottom-nav__label">{t('nav.wardrobe')}</span>
        </a>
        <a className="bottom-nav__item" href="#" onClick={(e) => { e.preventDefault(); session ? setPage('mypage') : setPage('auth') }}>
          <span className="material-symbols-outlined">{session ? 'manage_accounts' : 'person'}</span>
          <span className="bottom-nav__label">{session ? t('mypage.title') : t('nav.profile')}</span>
        </a>
      </nav>
    </div>
  )
}

export default App
