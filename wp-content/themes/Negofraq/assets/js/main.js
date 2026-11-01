// Menu mobile.
document.addEventListener('DOMContentLoaded', function () {
	var toggle = document.querySelector('.nav-toggle');
	if (!toggle) {
		return;
	}
	toggle.addEventListener('click', function () {
		var open = document.body.classList.toggle('nav-open');
		toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
	});
});

// Ombre de l'en-tête dès que la page défile.
document.addEventListener('DOMContentLoaded', function () {
	var header = document.querySelector('.site-header');
	if (!header) {
		return;
	}
	function update() {
		header.classList.toggle('is-scrolled', window.scrollY > 8);
	}
	window.addEventListener('scroll', update, { passive: true });
	update();
});

// Apparition douce des blocs au défilement. Sans JavaScript ou avec les animations réduites, tout reste visible.
document.addEventListener('DOMContentLoaded', function () {
	if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		return;
	}
	var observer = new IntersectionObserver(function (entries) {
		entries.forEach(function (entry) {
			if (!entry.isIntersecting) {
				return;
			}
			var el = entry.target;
			observer.unobserve(el);
			el.classList.add('is-visible');
			// Retire la classe ensuite pour laisser la main aux effets de survol.
			setTimeout(function () {
				el.classList.remove('js-reveal', 'is-visible');
				el.style.removeProperty('--reveal-delay');
			}, 1200);
		});
	}, { rootMargin: '0px 0px -8% 0px' });

	document.querySelectorAll('.section:not(.hero) > .wp-block-group__inner-container > h2, .picto, .card, .valeurs li, .duo .wp-block-column, .chiffre, .faq__groupe, .contact-form').forEach(function (el) {
		var siblings = Array.prototype.indexOf.call(el.parentNode.children, el);
		el.style.setProperty('--reveal-delay', Math.min(siblings, 4) * 70 + 'ms');
		el.classList.add('js-reveal');
		observer.observe(el);
	});
});
