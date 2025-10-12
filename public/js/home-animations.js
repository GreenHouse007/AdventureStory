const createAmbientParticles = (container, total = 30) => {
  if (!container) return;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < total; i += 1) {
    const particle = document.createElement('span');
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    const scale = 0.6 + Math.random() * 1.2;
    particle.style.transform = `scale(${scale})`;
    particle.style.animationDelay = `${Math.random() * 12}s`;
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
  const atmosphere = document.querySelector('.hero-atmosphere');
  if (!atmosphere) return;

  const handleScroll = () => {
    const y = window.scrollY || window.pageYOffset;
    atmosphere.style.transform = `translateY(${y * 0.08}px)`;
  };

  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });
};

const registerCarousel = () => {
  const track = document.querySelector('.story-carousel-track');
  if (!track) return;

  const scrollByCard = (direction) => {
    const card = track.querySelector('.story-card');
    const amount = card ? card.getBoundingClientRect().width + 24 : 320;
    track.scrollBy({ left: direction * amount, behavior: 'smooth' });
  };

  document.querySelectorAll('[data-carousel="prev"]').forEach((button) => {
    button.addEventListener('click', () => scrollByCard(-1));
  });

  document.querySelectorAll('[data-carousel="next"]').forEach((button) => {
    button.addEventListener('click', () => scrollByCard(1));
  });
};

const registerGsapSequences = () => {
  if (typeof window.gsap === 'undefined') return;
  const hero = document.querySelector('.home-hero');
  if (!hero) return;

  window.gsap.fromTo(
    hero.querySelector('.hero-content'),
    { opacity: 0, y: 40 },
    { opacity: 1, y: 0, duration: 1.6, ease: 'power3.out', delay: 0.2 },
  );

  window.gsap.to('.hero-lantern-stream', {
    yPercent: 6,
    duration: 18,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut',
  });
};

const init = () => {
  const ambientContainer = document.querySelector('.ambient-particles');
  createAmbientParticles(ambientContainer, 40);
  registerMotionObserver();
  registerParallax();
  registerCarousel();
  registerGsapSequences();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
