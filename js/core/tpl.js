/**
 * core/tpl.js — Auto-escaping tagged-template helper.
 *
 * Replaces the manual `escHtml(...)` discipline that guarded ~50 inline HTML
 * string builders. Interpolations are HTML-escaped by default, so you can't
 * forget and open an XSS hole:
 *
 *   html`<div class="word">${userText}</div>`   // userText is escaped
 *
 * When a value is already trusted, pre-built markup (e.g. a sub-template),
 * wrap it in Tpl.raw() to opt out of escaping:
 *
 *   html`<ul>${Tpl.raw(itemsHtml)}</ul>`
 *
 * Arrays are joined (so `${items.map(i => html`<li>${i}</li>`)}` works).
 *
 * Depends on: UI (for escHtml). Must load after ui.js, before features.
 */
const Tpl = (() => {

  // Marker wrapper for trusted, pre-escaped markup.
  class RawHtml {
    constructor(value) { this.value = String(value); }
  }

  function raw(value) { return new RawHtml(value); }

  function escapeValue(v) {
    if (v == null) return '';
    if (v instanceof RawHtml) return v.value;
    if (Array.isArray(v)) return v.map(escapeValue).join('');
    return (typeof UI !== 'undefined' ? UI.escHtml(String(v)) : String(v));
  }

  /** Tagged-template literal: html`<p>${value}</p>` → escaped string. */
  function html(strings, ...values) {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) {
      out += escapeValue(values[i]) + strings[i + 1];
    }
    return out;
  }

  return { html, raw, RawHtml };
})();

// Convenience global so feature modules can write `html\`...\`` directly.
const html = Tpl.html;
