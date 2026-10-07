/* Behaviour shared by every page: the header, pictures that fail to load, sections
   that fade in as they are reached and the newsletter form. */
(function () {
  'use strict';

  /* Header: transparent at the top, solid after 80px */

  var header = document.querySelector('[data-site-header]');
  if (header) {
    var update = function () {
      header.classList.toggle('is-solid', window.scrollY > 80);
    };
    update();
    /* Transitions switch on after the first paint, so a page that opens part way down
       does not fade its header in. */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        header.classList.add('is-ready');
      });
    });
    window.addEventListener('scroll', update, { passive: true });
  }

  /* Pictures: a failed photograph leaves its colour frame showing */

  function markBroken(image) {
    image.classList.add('is-broken');
  }

  document.addEventListener(
    'error',
    function (event) {
      if (event.target instanceof HTMLImageElement) markBroken(event.target);
    },
    true
  );

  document.querySelectorAll('img').forEach(function (image) {
    var hasSource = image.getAttribute('src') || image.currentSrc;
    if (hasSource && image.complete && image.naturalWidth === 0) markBroken(image);
  });

  /* Sections rise gently into view as they are reached. Without JavaScript, or for
     visitors who ask for less motion, everything is simply shown. */

  var revealed = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (calm || !('IntersectionObserver' in window)) {
    revealed.forEach(function (element) {
      element.classList.add('is-visible');
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    revealed.forEach(function (element) {
      observer.observe(element);
    });
  }

  /* Newsletter */

  document.querySelectorAll('[data-newsletter]').forEach(function (form) {
    var input = form.querySelector('input[name="email"]');
    var submit = form.querySelector('button[type="submit"]');
    var message = form.querySelector('[data-newsletter-status]');

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var email = input.value.trim();
      if (!email || !input.checkValidity()) {
        message.textContent = 'Please enter a valid email address.';
        input.focus();
        return;
      }

      submit.disabled = true;
      message.textContent = '';

      window
        .fetch('/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: email })
        })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { ok: response.ok, data: data };
            });
        })
        .then(function (result) {
          if (!result.ok) throw new Error(result.data.error || 'Something went wrong. Please try again.');
          input.value = '';
          message.textContent = 'Thank you. You are on the list.';
        })
        .catch(function (error) {
          message.textContent =
            error instanceof TypeError ? 'We could not reach the shop. Please try again.' : error.message;
        })
        .then(function () {
          submit.disabled = false;
        });
    });
  });
})();
