/* Behavior shared by every page: the header, the offers bar, the Shop menu, the mobile
   menu, search, pictures that fail to load, text that rises into view, accordions, the
   newsletter forms and sign up pop up, and the contact form. */
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var track = window.PamuqTrack || function () {};
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {}
  }

  function postJson(url, data) {
    return window
      .fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (result) {
            if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
            return result;
          });
      });
  }

  function formData(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      data[key] = typeof value === 'string' ? value.trim() : value;
    });
    return data;
  }

  /* Header: shrinks a little once the page scrolls, and turns solid over a photograph. */

  var top = document.querySelector('[data-site-top]');
  var megaOpen = false;
  function updateHeader() {
    var y = window.scrollY;
    top.classList.toggle('is-scrolled', y > 40);
    top.classList.toggle('is-solid', y > 80 || megaOpen);
  }
  if (top) {
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  /* Offers bar: one message at a time, changing every five seconds. It pauses while the
     pointer or focus is on it, does not move for visitors who ask for less motion, and
     stays closed once dismissed. */

  var announce = document.querySelector('[data-announce]');
  if (!announce) root.classList.add('no-announce');
  if (announce) {
    var messages = Array.prototype.slice.call(announce.querySelectorAll('.announce__message'));
    var current = 0;
    var paused = false;
    var showMessage = function (next) {
      messages[current].classList.remove('is-active');
      messages[current].setAttribute('aria-hidden', 'true');
      current = next;
      messages[current].classList.add('is-active');
      messages[current].removeAttribute('aria-hidden');
    };
    if (messages.length > 1 && !calm) {
      window.setInterval(function () {
        if (!paused && !document.hidden) showMessage((current + 1) % messages.length);
      }, 5000);
    }
    ['mouseenter', 'focusin'].forEach(function (type) {
      announce.addEventListener(type, function () {
        paused = true;
      });
    });
    ['mouseleave', 'focusout'].forEach(function (type) {
      announce.addEventListener(type, function () {
        paused = false;
      });
    });
    announce.querySelector('[data-announce-close]').addEventListener('click', function () {
      root.classList.add('announce-closed');
      storageSet('pamuq_announce', 'closed');
    });
  }

  /* Shop menu: opens on click or Enter, and on hover with a mouse. Escape, a click
     elsewhere or moving focus away closes it. */

  var mega = document.querySelector('[data-mega]');
  if (mega) {
    var megaToggle = mega.querySelector('[data-mega-toggle]');
    var megaPanel = mega.querySelector('[data-mega-panel]');
    var closeTimer = null;
    var openedByHover = false;
    var setMega = function (open) {
      megaOpen = open;
      megaPanel.hidden = !open;
      megaToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (top) updateHeader();
    };
    /* With a mouse, hovering opens the menu first, so the click that follows keeps it
       open instead of closing it again. */
    megaToggle.addEventListener('click', function () {
      if (megaPanel.hidden) setMega(true);
      else if (!openedByHover) setMega(false);
      openedByHover = false;
    });
    var hover = window.matchMedia('(hover: hover) and (min-width: 901px)');
    mega.addEventListener('mouseenter', function () {
      if (!hover.matches) return;
      window.clearTimeout(closeTimer);
      if (megaPanel.hidden) openedByHover = true;
      setMega(true);
    });
    mega.addEventListener('mouseleave', function () {
      if (!hover.matches) return;
      closeTimer = window.setTimeout(function () {
        setMega(false);
      }, 180);
    });
    mega.addEventListener('focusout', function (event) {
      if (!mega.contains(event.relatedTarget)) setMega(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !megaPanel.hidden) {
        setMega(false);
        megaToggle.focus();
      }
    });
    document.addEventListener('click', function (event) {
      if (!megaPanel.hidden && !mega.contains(event.target)) setMega(false);
    });
  }

  /* Dialogs: the mobile menu and search use <dialog>, which traps focus, closes on
     Escape and returns focus to the button that opened it. */

  function openDialog(dialog, trigger) {
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    dialog.showModal();
    root.classList.add('dialog-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    dialog.addEventListener(
      'close',
      function () {
        root.classList.remove('dialog-open');
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      },
      { once: true }
    );
    return true;
  }

  /* A click on the dark backdrop closes the dialog. */
  document.querySelectorAll('dialog').forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });

  var menu = document.querySelector('[data-mobile-menu]');
  var menuButton = document.querySelector('[data-menu-open]');
  if (menu && menuButton) {
    menuButton.addEventListener('click', function () {
      openDialog(menu, menuButton);
    });
    menu.querySelector('[data-menu-close]').addEventListener('click', function () {
      menu.close();
    });
  }

  /* Search over every product, color and category, in the browser. */

  var search = document.querySelector('[data-search]');
  var searchButton = document.querySelector('[data-search-open]');
  if (search && searchButton) {
    var input = search.querySelector('[data-search-input]');
    var results = search.querySelector('[data-search-results]');
    var status = search.querySelector('[data-search-status]');
    var suggestions = search.querySelector('[data-search-suggestions]');
    var products = null;

    var load = function () {
      if (products) return Promise.resolve(products);
      var loader = window.PamuqCart && window.PamuqCart.catalog;
      return (loader ? loader() : Promise.resolve([])).then(function (list) {
        products = list.map(function (entry) {
          var words = [entry.name, entry.category, entry.collection, entry.summary, entry.isSet ? 'set gift' : '']
            .concat(
              entry.colors.map(function (color) {
                return color.name;
              })
            )
            .join(' ')
            .toLowerCase();
          return { entry: entry, words: words };
        });
        return products;
      });
    };

    var paint = function () {
      var query = input.value.trim().toLowerCase();
      results.textContent = '';
      suggestions.hidden = Boolean(query);
      if (!query) {
        status.textContent = '';
        return;
      }
      load().then(function (list) {
        var terms = query.split(/\s+/);
        var found = list.filter(function (item) {
          return terms.every(function (term) {
            return item.words.indexOf(term) !== -1;
          });
        });
        status.textContent = found.length ? found.length + (found.length === 1 ? ' result' : ' results') : 'No towels match "' + input.value.trim() + '".';
        found.slice(0, 12).forEach(function (item) {
          var li = document.createElement('li');
          li.innerHTML =
            '<a class="search__result" href="/product/' + encodeURIComponent(item.entry.slug) + '">' +
            '<span class="search__result-media media"><img alt="" loading="lazy" decoding="async"></span>' +
            '<span><span class="search__result-name"></span><span class="search__result-meta"></span></span></a>';
          li.querySelector('img').src = item.entry.image;
          li.querySelector('.search__result-name').textContent = item.entry.name;
          li.querySelector('.search__result-meta').textContent = item.entry.category + ' · ' + item.entry.priceLabel;
          results.appendChild(li);
        });
      });
    };

    searchButton.addEventListener('click', function () {
      if (openDialog(search, searchButton)) {
        load();
        input.focus();
      }
    });
    search.querySelector('[data-search-close]').addEventListener('click', function () {
      search.close();
    });
    /* Escape in a search field would only clear it, so close the search instead. */
    search.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        search.close();
      }
    });
    input.addEventListener('input', paint);
    search.querySelector('[data-search-form]').addEventListener('submit', function (event) {
      event.preventDefault();
      var first = results.querySelector('a');
      if (first) window.location.assign(first.href);
    });
  }

  /* Pictures: an optimized picture that fails falls back to its original address, and a
     picture that cannot load at all leaves its colored frame showing. */

  function pictureFailed(image) {
    var fallback = image.getAttribute('data-fallback');
    if (fallback) {
      image.removeAttribute('data-fallback');
      image.removeAttribute('srcset');
      var picture = image.parentElement;
      if (picture && picture.tagName === 'PICTURE') {
        picture.querySelectorAll('source').forEach(function (source) {
          source.remove();
        });
      }
      image.src = fallback;
      return;
    }
    image.classList.add('is-broken');
  }

  document.addEventListener(
    'error',
    function (event) {
      if (event.target instanceof HTMLImageElement) pictureFailed(event.target);
    },
    true
  );

  document.querySelectorAll('img').forEach(function (image) {
    var hasSource = image.getAttribute('src') || image.currentSrc;
    if (hasSource && image.complete && image.naturalWidth === 0) pictureFailed(image);
  });

  /* Text rises gently as it comes into view. Anything already on screen, or everything
     for visitors who ask for less motion, is shown at once. */

  var revealed = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (calm || !('IntersectionObserver' in window)) {
    revealed.forEach(function (element) {
      element.classList.add('is-visible');
    });
  } else {
    var height = window.innerHeight;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 }
    );
    revealed.forEach(function (element) {
      if (element.getBoundingClientRect().top < height) element.classList.add('is-visible');
      else observer.observe(element);
    });
  }

  /* Accordions: one section open at a time. A link such as /product/x#care opens that
     section. */

  document.querySelectorAll('[data-accordion]').forEach(function (accordion) {
    var sections = Array.prototype.slice.call(accordion.querySelectorAll('.accordion__item'));
    var setOpen = function (section, open) {
      section.classList.toggle('is-open', open);
      section.querySelector('[data-accordion-trigger]').setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    accordion.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-accordion-trigger]');
      if (!trigger || !accordion.contains(trigger)) return;
      var section = trigger.closest('.accordion__item');
      var willOpen = !section.classList.contains('is-open');
      sections.forEach(function (other) {
        setOpen(other, other === section && willOpen);
      });
    });
    var openFromHash = function () {
      var target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (!target || sections.indexOf(target) === -1) return;
      sections.forEach(function (section) {
        setOpen(section, section === target);
      });
      target.scrollIntoView({ block: 'center' });
    };
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
  });

  /* Newsletter forms: the footer, the homepage section and the pop up. */

  var SUBSCRIBED_KEY = 'pamuq_subscribed';

  document.querySelectorAll('[data-newsletter]').forEach(function (form) {
    var field = form.querySelector('input[name="email"]');
    var submit = form.querySelector('button[type="submit"]');
    var message = form.querySelector('[data-newsletter-status]');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = formData(form);
      data.source = form.getAttribute('data-source') || 'footer';

      if (!data.email || !field.checkValidity()) {
        message.textContent = 'Please enter a valid email address.';
        field.focus();
        return;
      }

      submit.disabled = true;
      message.textContent = '';
      postJson('/newsletter', data)
        .then(function (result) {
          field.value = '';
          message.innerHTML = '';
          message.appendChild(document.createTextNode((result.message || 'Thank you.') + ' Your code for ' + (body.getAttribute('data-welcome') || '10% off') + ': '));
          var code = document.createElement('strong');
          code.textContent = result.code;
          message.appendChild(code);
          storageSet(SUBSCRIBED_KEY, '1');
          track('sign_up', { method: 'newsletter', source: data.source });
        })
        .catch(function (error) {
          message.textContent = error instanceof TypeError ? 'We could not reach the shop. Please try again.' : error.message;
        })
        .then(function () {
          submit.disabled = false;
        });
    });
  });

  /* Sign up pop up: after 20 seconds, half way down the page or as the pointer leaves
     the window, whichever comes first, but never in the first 5 seconds, never on the
     cart or order pages, and at most once every 14 days. */

  var popup = document.querySelector('[data-popup-dialog]');
  var POPUP_KEY = 'pamuq_popup_at';
  var FORTNIGHT = 14 * 24 * 60 * 60 * 1000;
  var lastShown = Number(storageGet(POPUP_KEY)) || 0;
  var popupAllowed =
    popup &&
    typeof popup.showModal === 'function' &&
    body.getAttribute('data-popup') === 'on' &&
    !storageGet(SUBSCRIBED_KEY) &&
    Date.now() - lastShown > FORTNIGHT;

  if (popupAllowed) {
    var started = Date.now();
    var done = false;
    var showPopup = function () {
      if (done || Date.now() - started < 5000) return;
      if (root.classList.contains('drawer-open') || document.querySelector('dialog[open]')) return;
      done = true;
      storageSet(POPUP_KEY, String(Date.now()));
      popup.showModal();
      root.classList.add('dialog-open');
      var field = popup.querySelector('input[name="email"]');
      if (field && window.matchMedia('(hover: hover)').matches) field.focus();
    };
    window.setTimeout(showPopup, 20000);
    window.addEventListener(
      'scroll',
      function () {
        var depth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
        if (depth >= 0.5) showPopup();
      },
      { passive: true }
    );
    document.addEventListener('mouseout', function (event) {
      if (!event.relatedTarget && event.clientY <= 0) showPopup();
    });
    popup.addEventListener('close', function () {
      root.classList.remove('dialog-open');
    });
    popup.querySelector('[data-popup-close]').addEventListener('click', function () {
      popup.close();
    });
  }

  /* Contact form */

  var contact = document.querySelector('[data-contact-form]');
  if (contact) {
    contact.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = contact.querySelector('[data-contact-status]');
      var data = formData(contact);
      var email = contact.querySelector('input[name="email"]');
      if (!data.name || !data.message || !email.checkValidity() || !data.email) {
        status.textContent = 'Please add your name, a valid email address and your message.';
        return;
      }
      var submit = contact.querySelector('button[type="submit"]');
      submit.disabled = true;
      postJson('/contact', data)
        .then(function () {
          contact.reset();
          status.textContent = 'Thank you. We have your message and will reply within one business day.';
        })
        .catch(function (error) {
          status.textContent = error instanceof TypeError ? 'We could not reach the shop. Please try again.' : error.message;
        })
        .then(function () {
          submit.disabled = false;
        });
    });
  }
})();
