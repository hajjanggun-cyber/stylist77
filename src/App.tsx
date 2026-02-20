import { useState, useRef } from 'react'
import './App.css'

function App() {
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [styleGoal, setStyleGoal] = useState('Professional & Sharp');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const formRef = useRef<HTMLElement>(null);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setSelectedImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const analyzeStyle = async () => {
    if (!height || !weight) { alert("키와 몸무게를 입력해주세요!"); return; }
    setLoading(true);
    setResult('');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ height, weight, styleGoal, imageBase64: selectedImage || undefined }),
      });
      const data = await response.json() as { result?: string; error?: string };
      if (!response.ok || data.error) { setResult(`오류: ${data.error || '알 수 없는 오류'}`); return; }
      setResult(data.result || '분석 결과가 없습니다.');
    } catch {
      setResult("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      {/* ── Sticky Nav ── */}
      <nav className="nav">
        <div className="nav__inner">
          <div className="nav__logo">
            <div className="nav__logo-icon">◆</div>
            <h1 className="nav__logo-text">Aura</h1>
          </div>
          <button className="nav__menu">☰</button>
        </div>
      </nav>

      <main className="main">
        {/* ── Hero ── */}
        <section className="hero">
          <div className="hero__blob hero__blob--tr" />
          <div className="hero__blob hero__blob--bl" />

          {/* AI Mockup Image */}
          <div className="hero__img-wrap">
            <img
              className="hero__img"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDC3pBfXiRTRPD0Eqq3lICfTMKWdslrXtke7dUMOZt1PhASMpMVRSehX0pkSP8OvNVammoA_xUEZSxYkncr8glL7NwzZ7NHDh-TqFlI9OYDIUHp4aPAg6tLfRwaHbxRBG3GcP7o6mmnCEYEWoEn7NCECS4S2M-Jv8CD6eFHTlFkvQX4oiEpTTuUP5n4T3J79EDW2ULtToYTOJUUnoZj7fgwRQtLwPFhDjYBA8-vbM19yVS0o-DZiYp-PC8M2QHI1VGSNiOAfxuNimUJ"
              alt="Fashion model standing with confident pose"
            />
            <div className="hero__overlay" />
            <div className="hero__scan-line" />
            <div className="hero__ui">
              <div className="hero__badge">
                <span className="hero__badge-dot" />
                AI ANALYZING
              </div>
              <div className="hero__data-points">
                <div className="hero__dp hero__dp--1">Height: 5'9"</div>
                <div className="hero__dp hero__dp--2">Style: Minimalist</div>
                <div className="hero__dp hero__dp--3">Match: 98%</div>
              </div>
            </div>
          </div>

          {/* Hero Text */}
          <div className="hero__content">
            <div className="hero__tag">✦ New Algorithm v2.0</div>
            <h2 className="hero__title">
              Find Your <span className="gradient-text">Perfect Fit</span> with AI
            </h2>
            <p className="hero__desc">
              Upload a photo and let our neural networks curate your wardrobe based on your unique biometric measurements.
            </p>
            <div className="hero__cta-wrap">
              <button className="hero__cta-btn" onClick={scrollToForm}>
                📷 Start Analysis
              </button>
              <p className="hero__cta-note">No credit card required for first scan</p>
            </div>
          </div>
        </section>

        {/* ── Social Proof ── */}
        <section className="brands">
          <span className="brands__name brands__name--serif">VOGUE</span>
          <span className="brands__name brands__name--italic">ELLE</span>
          <span className="brands__name brands__name--mono">WIRED</span>
          <span className="brands__name">GQ</span>
        </section>

        {/* ── Features ── */}
        <section className="features">
          <div className="features__header">
            <h3 className="features__title">Why Aura AI?</h3>
            <p className="features__sub">Advanced styling technology at your fingertips.</p>
          </div>
          <div className="features__list">
            {[
              { icon: '📐', bg: 'blue', title: 'Precision Styling', desc: 'Computer vision analyzes your exact measurements to ensure every garment fits like it was made for you.' },
              { icon: '📊', bg: 'purple', title: 'Personalized Trends', desc: 'Our algorithms predict upcoming trends that align specifically with your personal style history.' },
              { icon: '👗', bg: 'indigo', title: 'Wardrobe Optimization', desc: 'Maximize your closet potential by identifying mix-and-match opportunities you never saw before.' },
            ].map(f => (
              <div className="feature-card" key={f.title}>
                <div className={`feature-card__icon feature-card__icon--${f.bg}`}>{f.icon}</div>
                <div>
                  <h4 className="feature-card__title">{f.title}</h4>
                  <p className="feature-card__desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Quick Assessment Form ── */}
        <section className="assessment" ref={formRef}>
          <div className="assessment__card">
            <div className="assessment__top-bar" />
            <div className="assessment__body">
              <h3 className="assessment__title">Quick Assessment</h3>

              {/* Image Upload */}
              <label
                htmlFor="img-upload"
                className={`upload ${isDragging ? 'upload--drag' : ''} ${selectedImage ? 'upload--filled' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                {selectedImage
                  ? <img src={selectedImage} alt="Preview" className="upload__preview" />
                  : <div className="upload__placeholder">
                    <span className="upload__icon">📷</span>
                    <span className="upload__text">사진을 업로드하거나 드래그하세요</span>
                    <span className="upload__sub">JPG, PNG 지원</span>
                  </div>
                }
              </label>
              <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} hidden />

              <div className="form-grid">
                <div className="form-field">
                  <label className="form-label">HEIGHT (cm)</label>
                  <input className="form-input" type="number" placeholder="예: 175" value={height} onChange={e => setHeight(e.target.value)} />
                </div>
                <div className="form-field">
                  <label className="form-label">WEIGHT (kg)</label>
                  <input className="form-input" type="number" placeholder="예: 70" value={weight} onChange={e => setWeight(e.target.value)} />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">STYLE GOAL</label>
                <select className="form-input" value={styleGoal} onChange={e => setStyleGoal(e.target.value)}>
                  <option>Professional &amp; Sharp</option>
                  <option>Casual &amp; Relaxed</option>
                  <option>Trendy &amp; Bold</option>
                  <option>Date Night</option>
                </select>
              </div>

              <button className="submit-btn" onClick={analyzeStyle} disabled={loading}>
                {loading ? <span className="loader" /> : <>스타일 분석 시작 →</>}
              </button>
            </div>
            <div className="assessment__footer">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="result">
              <div className="result__top-bar" />
              <h3 className="result__title">📋 스타일 컨설팅 보고서</h3>
              <div className="result__body">
                {result.split('\n').map((line, i) => <p key={i}>{line}</p>)}
              </div>
            </div>
          )}
        </section>

        {/* ── Footer ── */}
        <footer className="footer">
          <div className="footer__logo">
            <div className="footer__logo-icon">◆</div>
            <span className="footer__logo-text">Aura</span>
          </div>
          <div className="footer__links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Support</a>
          </div>
          <p className="footer__copy">© 2025 Aura Style AI. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}

export default App;
