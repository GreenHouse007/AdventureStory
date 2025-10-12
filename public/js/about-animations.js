const createAmbientParticles = (container, total = 24) => {
  if (!container) return;

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < total; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'ambient-particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    const scale = 0.6 + Math.random();
    particle.style.transform = `scale(${scale})`;
    particle.style.animationDelay = `${Math.random() * 10}s`;
    fragment.appendChild(particle);
  }

  container.appendChild(fragment);
};

const registerMotionObserver = () => {
  const elements = document.querySelectorAll('[data-motion]');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('motion-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2,
      rootMargin: '0px 0px -10% 0px',
    },
  );

  elements.forEach((element) => observer.observe(element));
};

const registerParallax = () => {
  const overlay = document.querySelector('.about-hero .hero-atmosphere');
  if (!overlay) return;

  const handleScroll = () => {
    const y = window.scrollY || window.pageYOffset;
    overlay.style.transform = `translateY(${y * 0.06}px)`;
  };

  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
};

const registerGsapSequences = () => {
  if (typeof window.gsap === 'undefined') return;
  const heroContent = document.querySelector('.about-hero__content');
  if (heroContent) {
    window.gsap.fromTo(
      heroContent,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1.4, ease: 'power3.out', delay: 0.2 },
    );
  }

  window.gsap.utils.toArray('.about-visual').forEach((panel, index) => {
    window.gsap.to(panel, {
      yPercent: 4,
      duration: 12,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      delay: index * 1.2,
    });
  });
};

const init = () => {
  const ambientContainer = document.querySelector('.about-page .ambient-particles');
  createAmbientParticles(ambientContainer, 36);
  registerMotionObserver();
  registerParallax();
  registerGsapSequences();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
