/* Shop pages: filters and sorting that apply as they change, without a page load, and
   keep the address in step so a filtered view can be shared. Without JavaScript the
   same form submits and the server filters instead. */
(function () {
  'use strict';

  var form = document.querySelector('[data-filters]');
  var grid = document.querySelector('[data-grid]');
  if (!form || !grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-card]'));
  var total = cards.length;
  var count = form.querySelector('[data-filters-count]');
  var empty = document.querySelector('[data-filters-empty]');
  var toggle = form.querySelector('[data-filters-toggle]');
  var BANDS = {
    'under-25': [0, 2499],
    '25-50': [2500, 5000],
    '50-100': [5001, 10000],
    'over-100': [10001, Infinity]
  };

  function chosen(name) {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (input) {
        return input.value;
      });
  }

  function apply() {
    var category = chosen('category');
    var color = chosen('color');
    var weave = chosen('weave');
    var price = chosen('price');
    var sort = form.querySelector('[data-sort]').value;

    var shown = cards.filter(function (card) {
      var cardPrice = Number(card.getAttribute('data-price'));
      var cardColors = card.getAttribute('data-colors').split(' ');
      var match =
        (!category.length || category.indexOf(card.getAttribute('data-category')) !== -1) &&
        (!color.length ||
          color.some(function (key) {
            return cardColors.indexOf(key) !== -1;
          })) &&
        (!weave.length || weave.indexOf(card.getAttribute('data-weave')) !== -1) &&
        (!price.length ||
          price.some(function (key) {
            var band = BANDS[key];
            return band && cardPrice >= band[0] && cardPrice <= band[1];
          }));
      card.hidden = !match;
      return match;
    });

    var by = {
      'price-asc': function (a, b) {
        return a.getAttribute('data-price') - b.getAttribute('data-price') || a.getAttribute('data-position') - b.getAttribute('data-position');
      },
      'price-desc': function (a, b) {
        return b.getAttribute('data-price') - a.getAttribute('data-price') || a.getAttribute('data-position') - b.getAttribute('data-position');
      },
      newest: function (a, b) {
        return b.getAttribute('data-new') - a.getAttribute('data-new') || a.getAttribute('data-position') - b.getAttribute('data-position');
      },
      featured: function (a, b) {
        return a.getAttribute('data-position') - b.getAttribute('data-position');
      }
    }[sort] || function () {
      return 0;
    };
    cards.slice().sort(by).forEach(function (card) {
      grid.appendChild(card);
    });

    count.textContent = shown.length === total ? total + ' pieces' : 'Showing ' + shown.length + ' of ' + total + ' pieces';
    if (empty) empty.hidden = shown.length > 0;

    var url = new URL(window.location.href);
    [['category', category], ['color', color], ['weave', weave], ['price', price]].forEach(function (pair) {
      if (pair[1].length) url.searchParams.set(pair[0], pair[1].join(','));
      else url.searchParams.delete(pair[0]);
    });
    if (sort !== 'featured') url.searchParams.set('sort', sort);
    else url.searchParams.delete('sort');
    window.history.replaceState(null, '', url);
  }

  form.addEventListener('change', apply);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    apply();
    form.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });

  document.querySelectorAll('[data-filters-clear]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      form.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
        input.checked = false;
      });
      form.querySelector('[data-sort]').value = 'featured';
      apply();
    });
  });

  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = !form.classList.contains('is-open');
      form.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* The server has already filtered the page; this sets the count and takes over. */
  var initial = cards.filter(function (card) {
    return !card.hidden;
  }).length;
  count.textContent = total + ' pieces';
  if (initial !== total) apply();
})();
