import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import html2canvas from 'html2canvas'
import './App.css'

type Page = 'landing' | 'form'
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
        setResult(t('error.refundProcessed'))
      }
    } catch {}
  }

  // 실제 분석 API 호출 (state와 독립적으로 값을 직접 받음)
  const runAnalysis = async (h: string, w: string, sg: StyleGoalId, img: string | null) => {
    setLoading(true)
    setResult('')
    setHairstyleImage(null)
    const lang = i18n.language.startsWith('ko') ? 'ko' : 'en'
    try {
      const goalValue = t(`styleGoalValue.${sg}`)
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ height: h, weight: w, styleGoal: goalValue, imageBase64: img || undefined, lang }),
      })
      const data = await response.json() as { result?: string; error?: string; hairstyleImage?: string }
      if (!response.ok || data.error) {
        setResult(`오류: ${data.error || '알 수 없는 오류'}`)
        await triggerRefund()
        return
      }
      setResult(data.result || t('result.noResult'))
      setHairstyleImage(data.hairstyleImage || null)
      setAnalysisSuccess(true)
      // 분석 성공 즉시 결제 플래그 삭제 (일회성 결제)
      localStorage.removeItem('aura_paid')
      localStorage.removeItem('aura_order_id')
      setHasPaid(false)
    } catch {
      setResult(t('error.networkError'))
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
            await navigator.share({ title: t('share.title'), text: t('share.text'), files: [file] })
          } else if (navigator.share) {
            await navigator.share({ title: t('share.title'), text: result })
          } else {
            await navigator.clipboard.writeText(result)
            alert(t('error.clipboardCopied'))
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
    if (!height || !weight) { alert(t('error.noMeasurements')); return }

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

  const toggleLang = () => {
    const next = i18n.language.startsWith('ko') ? 'en' : 'ko'
    i18n.changeLanguage(next)
  }

  // ── Landing Page ──
  if (page === 'landing') {
    return (
      <div className="app">
        <div className="landing">

          {/* Sticky Header */}
          <header className="landing__header">
            <span className="landing__logo-text">AURA</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={toggleLang}
                style={{
                  background: 'none',
                  border: '1px solid #ccc',
                  color: '#333',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
                aria-label="Switch language"
              >
                {i18n.language.startsWith('ko') ? 'EN' : '한국어'}
              </button>
              <button className="landing__header-menu" aria-label={t('landing.menu')}>
                <span className="material-symbols-outlined">menu</span>
              </button>
            </div>
          </header>

          {/* Hero Image */}
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

          {/* Content */}
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
              <button className="landing__cta" onClick={() => setPage('form')}>
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

            {hasPaid && (
              <button
                style={{ marginTop: 4, background: 'none', border: 'none', color: '#bbb', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { localStorage.clear(); location.reload() }}
              >
                {t('landing.resetPayment')}
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
      {/* Scan Line Loading Overlay */}
      {loading && (
        <div className="scan-overlay">
          <div className="scan-card">
            <div className="scan-card__bg">
              {selectedImage
                ? <img src={selectedImage} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.4, filter:'grayscale(0.5)' }} />
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

      {/* Form Page Hero Banner */}
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
          <button
            onClick={toggleLang}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 20,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
            aria-label="Switch language"
          >
            {i18n.language.startsWith('ko') ? 'EN' : '한국어'}
          </button>
        </div>
      </div>

      <main className="main">
        {/* Title */}
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

        {/* Height & Weight */}
        <section className="section-metrics">
          <div className="metrics-grid">
            <div className="metric-field">
              <label className="metric-label" htmlFor="height">{t('form.height')}</label>
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
              <label className="metric-label" htmlFor="weight">{t('form.weight')}</label>
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

        {/* Result */}
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
          </section>
        )}

        {/* Save & Share */}
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
              onClick={() => {
                localStorage.removeItem('aura_paid')
                localStorage.removeItem('aura_order_id')
                setHasPaid(false)
                goToLanding()
              }}
              disabled={saving || sharing}
            >
              <span className="material-symbols-outlined">home</span>
              {t('button.home')}
            </button>
          </section>
        )}

        {/* Analyze Button */}
        {!analysisSuccess && <section className="section-cta">
          <button className="cta-btn" onClick={analyzeStyle} disabled={loading}>
            {loading
              ? <><span className="loader" />&nbsp;{hasPaid ? t('button.analyzing') : t('button.redirecting')}</>
              : hasPaid
                ? t('button.analyze')
                : t('button.analyzeWithPayment')
            }
          </button>
          <p className="cta-note">
            {hasPaid ? t('cta.noteAfterPaid') : t('cta.noteBefore')}
          </p>
        </section>}
      </main>

      {/* Bottom Nav */}
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
        <a className="bottom-nav__item" href="#">
          <span className="material-symbols-outlined">person</span>
          <span className="bottom-nav__label">{t('nav.profile')}</span>
        </a>
      </nav>
    </div>
  )
}

export default App
