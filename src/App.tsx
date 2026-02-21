import { useState, useRef } from 'react'
import './App.css'

type Page = 'landing' | 'form'

function App() {
  const [page, setPage] = useState<Page>('landing')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [styleGoal, setStyleGoal] = useState('Professional & Sharp')
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
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ height, weight, styleGoal, imageBase64: selectedImage || undefined }),
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

  const progress = height && weight ? (selectedImage ? 100 : 66) : 33

  // ── Landing Page ──
  if (page === 'landing') {
    return (
      <div className="landing">
        <div className="landing__bg-glow" />

        <header className="landing__header">
          <div className="landing__logo">
            <span className="material-symbols-outlined landing__logo-icon">styler</span>
            <span className="landing__logo-text">AI Stylist</span>
          </div>
        </header>

        <main className="landing__main">
          <div className="landing__badge">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
            AI-Powered Style Engine
          </div>

          <h1 className="landing__title">
            Discover Your <span className="landing__title-accent">Perfect Style</span>
          </h1>

          <p className="landing__desc">
            Upload your photo, share your measurements, and let our AI craft a personalized style report tailored just for you.
          </p>

          <div className="landing__features">
            {[
              { icon: 'body_system', label: 'Body Shape Analysis' },
              { icon: 'palette', label: 'Color Palette' },
              { icon: 'content_cut', label: 'Hair Recommendations' },
            ].map(f => (
              <div className="landing__feature" key={f.label}>
                <span className="material-symbols-outlined landing__feature-icon">{f.icon}</span>
                <span className="landing__feature-label">{f.label}</span>
              </div>
            ))}
          </div>

          <button className="landing__cta" onClick={() => setPage('form')}>
            Start My Style Analysis
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>

          <p className="landing__note">No sign-up required · Free to use</p>
        </main>
      </div>
    )
  }

  // ── Form Page ──
  return (
    <div>
      <header className="header">
        <div className="header__top">
          <button className="header__back" onClick={goToLanding}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="header__title">AI Stylist</h1>
          <div className="header__spacer" />
        </div>
        <div className="progress">
          <div className="progress__labels">
            <span className="progress__step">
              {progress < 50 ? 'Step 1 of 3' : progress < 100 ? 'Step 2 of 3' : 'Step 3 of 3'}
            </span>
            <span className="progress__pct">{progress}% Complete</span>
          </div>
          <div className="progress__bar">
            <div className="progress__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="main">
        <div className="section-heading">
          <h2>Physical Profile</h2>
          <p>Provide your details to help our AI understand your proportions for the most accurate style recommendations.</p>
        </div>

        <span className="upload-label">Full-Body Photo</span>
        <div
          className={`upload-zone${isDragging ? ' upload-zone--drag' : ''}${selectedImage ? ' upload-zone--filled' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !selectedImage && fileInputRef.current?.click()}
        >
          {selectedImage ? (
            <img src={selectedImage} alt="Preview" className="upload-zone__preview" />
          ) : (
            <div className="upload-zone__placeholder">
              <div className="upload-zone__icon-wrap">
                <span className="material-symbols-outlined upload-zone__icon">person_search</span>
              </div>
              <p className="upload-zone__title">Upload a full-body photo</p>
              <p className="upload-zone__sub">Wear form-fitting clothes in a well-lit area for the best results.</p>
              <div className="upload-zone__btns">
                <button className="btn-upload-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cloud_upload</span>
                  Choose File
                </button>
                <button className="btn-upload-secondary">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>photo_camera</span>
                  Take Photo
                </button>
              </div>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} hidden />

        <div className="metrics">
          <div>
            <label className="field-label" htmlFor="height">Height</label>
            <div className="input-wrap">
              <input id="height" className="field-input" type="number" placeholder="175"
                value={height} onChange={e => setHeight(e.target.value)} />
              <span className="input-unit">cm</span>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="weight">Weight</label>
            <div className="input-wrap">
              <input id="weight" className="field-input" type="number" placeholder="70"
                value={weight} onChange={e => setWeight(e.target.value)} />
              <span className="input-unit">kg</span>
            </div>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Style Goal</label>
          <select className="field-select" value={styleGoal} onChange={e => setStyleGoal(e.target.value)}>
            <option>Professional &amp; Sharp</option>
            <option>Casual &amp; Relaxed</option>
            <option>Trendy &amp; Bold</option>
            <option>Date Night</option>
          </select>
        </div>

        <div className="info-box">
          <span className="material-symbols-outlined info-box__icon">info</span>
          <div>
            <p className="info-box__title">Why this matters?</p>
            <p className="info-box__text">Our AI calculates your body shape and proportions to recommend cuts that flatter your specific silhouette.</p>
          </div>
        </div>

        {result && (
          <div className="result">
            <div className="result__bar" />
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
                  추천 헤어스타일
                </p>
                <img src={hairstyleImage} alt="추천 헤어스타일" className="result__hairstyle-img" />
              </div>
            )}
            <div className="result__footer">
              <button className="btn-home" onClick={goToLanding}>
                <span className="material-symbols-outlined">home</span>
                홈으로 돌아가기
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <button className="btn-generate" onClick={analyzeStyle} disabled={loading}>
            {loading
              ? <><span className="loader" /> 분석 중...</>
              : <><span>Generate My Style</span><span className="material-symbols-outlined">auto_awesome</span></>
            }
          </button>
        </div>
      </footer>
    </div>
  )
}

export default App
