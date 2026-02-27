import { useState, useRef, useEffect } from 'react'
import html2canvas from 'html2canvas'
import './App.css'

type Page = 'landing' | 'form'
type StyleGoalId = 'casual' | 'formal' | 'trendy' | 'date'

interface StyleGoalOption {
  id: StyleGoalId
  icon: string
  label: string
  value: string
}

const STYLE_GOALS: StyleGoalOption[] = [
  { id: 'casual', icon: 'check_circle', label: '캐주얼', value: '캐주얼 & 편안함' },
  { id: 'formal', icon: 'business_center', label: '포멀', value: '프로페셔널 & 샤프' },
  { id: 'trendy', icon: 'auto_awesome', label: '트렌디', value: '트렌디 & 볼드' },
  { id: 'date', icon: 'favorite', label: '데이트', value: '데이트룩' },
]

function App() {
  const [page, setPage] = useState<Page>('landing')
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLElement>(null)
  // 결제 후 자동 분석을 위해 복원된 폼 데이터를 ref로 보관
  const pendingAnalysisRef = useRef<{ height: string; weight: string; styleGoal: StyleGoalId; image: string | null } | null>(null)

  // 앱 시작 시: localStorage 확인 + 결제 후 리다이렉트 처리
  useEffect(() => {
    const paid = localStorage.getItem('aura_paid') === 'true'
    if (paid) { setHasPaid(true) }

    const params = new URLSearchParams(window.location.search)
    const checkoutId = params.get('checkout_id')
    if (!checkoutId) return

    setVerifying(true)
    fetch(`/api/verify-checkout?checkout_id=${checkoutId}`)
      .then(r => r.json())
      .then((data: { paid: boolean; orderId?: string }) => {
        if (!data.paid) return
        localStorage.setItem('aura_paid', 'true')
        if (data.orderId) localStorage.setItem('aura_order_id', data.orderId)
        window.history.replaceState({}, '', '/')

        // 결제 전 저장해둔 폼 데이터 복원
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
            pendingAnalysisRef.current = { ...saved, image: savedImage } // 자동 분석 트리거용
          } catch {}
        }
        setHasPaid(true) // 이 시점에 아래 useEffect가 실행됨
      })
      .catch(() => {})
      .finally(() => setVerifying(false))
  }, [])

  // hasPaid가 true가 되고 pendingAnalysisRef에 데이터가 있으면 자동 분석 실행
  useEffect(() => {
    if (!hasPaid || !pendingAnalysisRef.current) return
    const saved = pendingAnalysisRef.current
    pendingAnalysisRef.current = null
    setPage('form')
    runAnalysis(saved.height, saved.weight, saved.styleGoal, saved.image)
  }, [hasPaid])

  const goToLanding = () => {
    setPage('landing')
    setResult('')
    setHairstyleImage(null)
    setHeight('')
    setWeight('')
    setSelectedImage(null)
    setAnalysisSuccess(false)
  }

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

  const triggerRefund = async () => {
    const orderId = localStorage.getItem('aura_order_id')
    if (!orderId) return
    try {
      const res = await fetch('/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json() as { success?: boolean }
      if (data.success) {
        localStorage.removeItem('aura_paid')
        localStorage.removeItem('aura_order_id')
        setHasPaid(false)
        setResult('분석 서비스 오류로 자동 환불 처리되었습니다.\n다시 분석을 시도해주세요.')
      }
    } catch {}
  }

  // 실제 분석 API 호출 (state와 독립적으로 값을 직접 받음)
  const runAnalysis = async (h: string, w: string, sg: StyleGoalId, img: string | null) => {
    setLoading(true)
    setResult('')
    setHairstyleImage(null)
    try {
      const goalValue = STYLE_GOALS.find(g => g.id === sg)?.value ?? '캐주얼 & 편안함'
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ height: h, weight: w, styleGoal: goalValue, imageBase64: img || undefined }),
      })
      const data = await response.json() as { result?: string; error?: string; hairstyleImage?: string }
      if (!response.ok || data.error) {
        setResult(`오류: ${data.error || '알 수 없는 오류'}`)
        await triggerRefund()
        return
      }
      setResult(data.result || '분석 결과가 없습니다.')
      setHairstyleImage(data.hairstyleImage || null)
      setAnalysisSuccess(true)
    } catch {
      setResult('네트워크 오류가 발생했습니다.')
      setAnalysisSuccess(false)
      await triggerRefund()
    } finally {
      setLoading(false)
    }
  }

  const saveAsImage = async () => {
    if (!resultRef.current) return
    setSaving(true)
    try {
      const canvas = await html2canvas(resultRef.current, {
        backgroundColor: '#10221d',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = 'aura-style-report.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const shareResult = async () => {
    if (!resultRef.current) return
    setSharing(true)
    try {
      const canvas = await html2canvas(resultRef.current, {
        backgroundColor: '#10221d',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      canvas.toBlob(async (blob) => {
        if (!blob) { setSharing(false); return }
        const file = new File([blob], 'aura-style-report.png', { type: 'image/png' })
        try {
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: 'Aura AI 스타일 리포트', text: '나만의 AI 퍼스널 스타일 분석 결과!', files: [file] })
          } else if (navigator.share) {
            await navigator.share({ title: 'Aura AI 스타일 리포트', text: result })
          } else {
            await navigator.clipboard.writeText(result)
            alert('결과가 클립보드에 복사되었습니다.')
          }
        } catch {}
        setSharing(false)
      })
    } catch {
      setSharing(false)
    }
  }

  // 분석 버튼 클릭: 미결제 → 결제 흐름, 결제 완료 → 분석 실행
  const analyzeStyle = async () => {
    if (!height || !weight) { alert('키와 몸무게를 입력해주세요!'); return }

    if (!hasPaid) {
      // 폼 데이터 저장 후 결제 페이지로 이동
      localStorage.setItem('aura_pending_form', JSON.stringify({ height, weight, styleGoal }))
      if (selectedImage) {
        try { localStorage.setItem('aura_pending_image', selectedImage) } catch {}
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
          alert('결제 페이지 이동 중 오류가 발생했습니다.')
          setLoading(false)
        }
      } catch {
        alert('결제 페이지 이동 중 오류가 발생했습니다.')
        setLoading(false)
      }
      return
    }

    await runAnalysis(height, weight, styleGoal, selectedImage)
  }

  // ── Landing Page ──
  if (page === 'landing') {
    return (
      <div className="app">
        <div className="landing">
          <div className="landing__glow" />

          <header className="landing__header">
            <div className="landing__logo-wrap">
              <span className="material-symbols-outlined landing__logo-icon">styler</span>
            </div>
            <span className="landing__logo-text">AI Stylist</span>
          </header>

          <main className="landing__main">
            <div className="landing__badge">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
              AI 기반 퍼스널 스타일링
            </div>

            <h1 className="landing__title">
              나만의 완벽한<br />
              <span className="landing__title-accent">스타일을 찾아보세요</span>
            </h1>

            <p className="landing__desc">
              사진을 업로드하고 신체 정보를 입력하면,<br />
              AI가 당신만을 위한 맞춤 스타일 보고서와<br />
              추천 헤어스타일을 제공합니다.
            </p>

            <div className="landing__features">
              {[
                { icon: 'body_system', label: '체형 분석' },
                { icon: 'palette', label: '컬러 팔레트' },
                { icon: 'content_cut', label: '헤어 추천' },
              ].map(f => (
                <div className="landing__feature" key={f.label}>
                  <div className="landing__feature-icon-wrap">
                    <span className="material-symbols-outlined">{f.icon}</span>
                  </div>
                  <span className="landing__feature-label">{f.label}</span>
                </div>
              ))}
            </div>

            {verifying ? (
              <button className="landing__cta" disabled>
                <span className="loader" />&nbsp;결제 확인 중...
              </button>
            ) : (
              <button className="landing__cta" onClick={() => setPage('form')}>
                스타일 분석 시작하기
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            )}

            <p className="landing__note">정보 입력 후 결제 · 회원가입 불필요</p>

            {hasPaid && (
              <button
                style={{ marginTop: 8, background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { localStorage.clear(); location.reload() }}
              >
                결제 초기화 (테스트용)
              </button>
            )}
          </main>
        </div>
      </div>
    )
  }

  // ── Form / Result Page ──
  return (
    <div className="app">
      <header className="header">
        <button className="header__back" onClick={goToLanding} aria-label="뒤로가기">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="header__title">스타일 분석</h2>
        <div className="header__spacer" />
      </header>

      <main className="main">
        {/* Title */}
        <section className="section-hero">
          <h1 className="section-hero__title">나의 실루엣<br />분석하기</h1>
          <p className="section-hero__sub">
            AI가 체형과 비율을 분석하여 나에게 딱 맞는<br />
            스타일과 헤어스타일을 추천해드립니다.
          </p>
        </section>

        {/* Upload Zone */}
        <section className="section-upload">
          <div
            className={`upload-zone${isDragging ? ' upload-zone--drag' : ''}${selectedImage ? ' upload-zone--filled' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !selectedImage && fileInputRef.current?.click()}
          >
            {selectedImage ? (
              <>
                <img src={selectedImage} alt="미리보기" className="upload-zone__preview" />
                <button
                  className="upload-zone__remove"
                  onClick={(e) => { e.stopPropagation(); setSelectedImage(null) }}
                  aria-label="사진 제거"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </>
            ) : (
              <>
                <div className="upload-zone__icon-wrap">
                  <span className="material-symbols-outlined upload-zone__icon">photo_camera</span>
                </div>
                <p className="upload-zone__title">전신 사진을 업로드해주세요</p>
                <p className="upload-zone__sub">탭하거나 드래그하여 업로드</p>
                <button
                  className="upload-zone__btn"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                >
                  사진 선택
                </button>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} hidden />
        </section>

        {/* Height & Weight */}
        <section className="section-metrics">
          <div className="metrics-grid">
            <div className="metric-field">
              <label className="metric-label" htmlFor="height">키 (cm)</label>
              <input
                id="height"
                className="metric-input"
                type="number"
                placeholder="175"
                value={height}
                onChange={e => setHeight(e.target.value)}
              />
            </div>
            <div className="metric-field">
              <label className="metric-label" htmlFor="weight">몸무게 (kg)</label>
              <input
                id="weight"
                className="metric-input"
                type="number"
                placeholder="70"
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Style Goal */}
        <section className="section-goal">
          <label className="goal-label">스타일 목표</label>
          <div className="goal-grid">
            {STYLE_GOALS.map(g => (
              <button
                key={g.id}
                className={`goal-btn${styleGoal === g.id ? ' goal-btn--active' : ''}`}
                onClick={() => setStyleGoal(g.id)}
              >
                <span className="material-symbols-outlined goal-btn__icon">{g.icon}</span>
                <span className="goal-btn__label">{g.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Result */}
        {result && (
          <section ref={resultRef} className="section-result">
            <div className="result__header">
              <span className="material-symbols-outlined">auto_awesome</span>
              스타일 컨설팅 결과
            </div>
            <div className="result__body">
              {result.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
            {hairstyleImage && (
              <div className="result__hairstyle">
                <p className="result__hairstyle-title">
                  <span className="material-symbols-outlined">content_cut</span>
                  추천 헤어스타일 9종
                </p>
                <img src={hairstyleImage} alt="추천 헤어스타일" className="result__hairstyle-img" />
              </div>
            )}
          </section>
        )}

        {/* Save & Share */}
        {analysisSuccess && (
          <section className="result-actions">
            <button className="result-action-btn" onClick={saveAsImage} disabled={saving || sharing}>
              <span className="material-symbols-outlined">download</span>
              {saving ? '저장 중...' : '이미지 저장'}
            </button>
            <button className="result-action-btn result-action-btn--share" onClick={shareResult} disabled={saving || sharing}>
              <span className="material-symbols-outlined">share</span>
              {sharing ? '공유 중...' : '공유하기'}
            </button>
          </section>
        )}

        {/* Analyze Button */}
        <section className="section-cta">
          <button className="cta-btn" onClick={analyzeStyle} disabled={loading}>
            {loading
              ? <><span className="loader" />&nbsp;{hasPaid ? '분석 중...' : '결제 페이지 이동 중...'}</>
              : hasPaid
                ? '스타일 분석하기'
                : '결제 후 분석하기 · $3.99'
            }
          </button>
          <p className="cta-note">
            {hasPaid
              ? '분석 버튼을 클릭하면 AI 분석 서비스 이용약관에 동의하는 것으로 간주됩니다.'
              : '키와 몸무게 입력 후 결제가 진행됩니다. 분석 실패 시 자동 환불됩니다.'}
          </p>
        </section>
      </main>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <a className="bottom-nav__item" href="#" onClick={(e) => { e.preventDefault(); goToLanding() }}>
          <span className="material-symbols-outlined">home</span>
          <span className="bottom-nav__label">홈</span>
        </a>
        <a className="bottom-nav__item bottom-nav__item--active" href="#">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
          <span className="bottom-nav__label">분석</span>
        </a>
        <a className="bottom-nav__item" href="#">
          <span className="material-symbols-outlined">checkroom</span>
          <span className="bottom-nav__label">옷장</span>
        </a>
        <a className="bottom-nav__item" href="#">
          <span className="material-symbols-outlined">person</span>
          <span className="bottom-nav__label">프로필</span>
        </a>
      </nav>
    </div>
  )
}

export default App
