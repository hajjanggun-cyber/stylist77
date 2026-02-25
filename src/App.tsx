import { useState, useRef } from 'react'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const goToLanding = () => {
    setPage('landing')
    setResult('')
    setHairstyleImage(null)
    setHeight('')
    setWeight('')
    setSelectedImage(null)
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

  const analyzeStyle = async () => {
    if (!height || !weight) { alert('키와 몸무게를 입력해주세요!'); return }
    setLoading(true)
    setResult('')
    setHairstyleImage(null)
    try {
      const selectedGoal = STYLE_GOALS.find(g => g.id === styleGoal)?.value ?? '캐주얼 & 편안함'
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ height, weight, styleGoal: selectedGoal, imageBase64: selectedImage || undefined }),
      })
      const data = await response.json() as { result?: string; error?: string; hairstyleImage?: string }
      if (!response.ok || data.error) { setResult(`오류: ${data.error || '알 수 없는 오류'}`); return }
      setResult(data.result || '분석 결과가 없습니다.')
      setHairstyleImage(data.hairstyleImage || null)
    } catch {
      setResult('네트워크 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
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

            <button className="landing__cta" onClick={() => setPage('form')}>
              스타일 분석 시작하기
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>

            <p className="landing__note">회원가입 불필요 · 무료 이용</p>
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
          <section className="section-result">
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

        {/* Analyze Button */}
        <section className="section-cta">
          <button className="cta-btn" onClick={analyzeStyle} disabled={loading}>
            {loading
              ? <><span className="loader" />&nbsp;분석 중...</>
              : '스타일 분석하기'
            }
          </button>
          <p className="cta-note">
            분석 버튼을 클릭하면 AI 분석 서비스 이용약관에 동의하는 것으로 간주됩니다.
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
