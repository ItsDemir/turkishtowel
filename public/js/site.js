/* Behaviour shared by every page: the header, pictures that fail to load, the colour
   filter on the collection page and the newsletter form. */
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

  /* Collection: filter by colour */

  var group = document.querySelector('[data-filter-group]');
  var grid = document.querySelector('[data-grid]');

  if (group && grid) {
    var cards = Array.prototype.slice.call(grid.children);
    var buttons = Array.prototype.slice.call(group.querySelectorAll('[data-filter]'));
    var clearButton = group.querySelector('[data-filter-clear]');
    var status = document.querySelector('[data-filter-status]');
    var current = null;

    var applyFilter = function (family) {
      current = family;
      var shown = 0;

      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-filter') === family ? 'true' : 'false');
      });
      cards.forEach(function (card) {
        var families = (card.getAttribute('data-families') || '').split(' ');
        var match = !family || families.indexOf(family) !== -1;
        card.hidden = !match;
        if (match) shown += 1;
      });

      clearButton.hidden = !family;
      status.textContent = family ? 'Showing ' + shown + ' of ' + cards.length + ' towels.' : '';
    };

    group.addEventListener('click', function (event) {
      var button = event.target.closest('[data-filter]');
      if (button) {
        var family = button.getAttribute('data-filter');
        applyFilter(current === family ? null : family);
        return;
      }
      if (event.target.closest('[data-filter-clear]')) {
        applyFilter(null);
        buttons[0].focus();
      }
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
