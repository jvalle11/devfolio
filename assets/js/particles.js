document.addEventListener('DOMContentLoaded', function() {
  particlesJS('particles-js', {
    particles: {
      color: '#ffffff',
      shape: 'circle',
      opacity: 0.7,
      size: 3,
      move: {
        enable: true,
        speed: 2,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        attract: { enable: true, rotateX: 600, rotateY: 1200 }
      },
      number: { density: { enable: true, value_area: 10000 } } // Hardcode density here
    }
  });
});