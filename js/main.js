// ── THEME TOGGLE ──
function toggleTheme(){
    const html=document.documentElement;
    const isDark=html.getAttribute('data-theme')==='dark';
    html.setAttribute('data-theme',isDark?'light':'dark');
    document.getElementById('theme-toggle').textContent=isDark?'☾':'☀';
  }
  
  // ── LANG TOGGLE ──
  function toggleLang(){
    const html=document.documentElement;
    const isZh=html.getAttribute('data-lang')==='zh';
    html.setAttribute('data-lang',isZh?'en':'zh');
    document.getElementById('lang-toggle').textContent=isZh?'中':'EN';
    document.documentElement.lang=isZh?'en':'zh-CN';
  }
  
  // ── SCROLL REVEAL ──
  const revealObserver=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    });
  },{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));
  
  // ── NAV ACTIVE ──
  const sections=document.querySelectorAll('section[id]');
  const navLinks=document.querySelectorAll('.nav-links a');
  const navObserver=new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        navLinks.forEach(l=>{
          l.style.color='';
          if(l.getAttribute('href')==='#'+e.target.id){
            l.style.color='var(--text)';
          }
        });
      }
    });
  },{threshold:0.4});
  sections.forEach(s=>navObserver.observe(s));
  
  // ── SMOOTH NAV BG ──
  window.addEventListener('scroll',()=>{
    const nav=document.querySelector('nav');
    if(window.scrollY>60){
      nav.style.borderBottomColor='var(--border2)';
    }else{
      nav.style.borderBottomColor='var(--border)';
    }
  });