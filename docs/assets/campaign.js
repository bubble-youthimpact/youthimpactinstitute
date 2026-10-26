// Live campaign sign-up count (Firebase Firestore). No emails are sent for sign-ups.
// Loaded only on campaign pages, and only when content/site.json has a "firebase" config.
//
// Firestore layout:  campaigns/{campaign-slug}/signups/{hash of email}  → { createdAt }
// No names or emails are stored in Firestore: the doc id is a one-way hash, so one email
// can only be counted once per campaign. Names and emails are not stored or sent anywhere.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, doc, setDoc, serverTimestamp, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const form = document.querySelector('[data-join]');
const num = document.querySelector('[data-count-num]');
if (form && num && window.YII_FIREBASE) {
  const db = getFirestore(initializeApp(window.YII_FIREBASE));
  const slug = form.dataset.campaign;
  const base = Number(num.dataset.base || 0);
  const signups = collection(db, 'campaigns', slug, 'signups');
  const show = (sel) => ['[data-thanks]', '[data-already]', '[data-error]'].forEach((s) => (form.querySelector(s).hidden = s !== sel));

  async function refresh(bump) {
    try {
      const snap = await getCountFromServer(signups);
      num.textContent = (base + snap.data().count).toLocaleString('en-US');
      if (bump) { num.classList.add('bump'); setTimeout(() => num.classList.remove('bump'), 300); }
    } catch (e) { /* keep the number already on the page */ }
  }
  refresh(false);

  async function hash(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.querySelector('[name=_honey]').value) return; // bot
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    const email = String(data.email || '').trim().toLowerCase();
    try {
      const id = await hash(`${slug}:${email}`);
      try {
        await setDoc(doc(signups, id), { createdAt: serverTimestamp() });
      } catch (err) {
        // the security rules refuse a second write to the same id = already signed
        if (err && err.code === 'permission-denied') { show('[data-already]'); return; }
        throw err;
      }
      show('[data-thanks]');
      form.reset();
      refresh(true);
    } catch (err) {
      show('[data-error]');
    } finally {
      btn.disabled = false;
    }
  });
}
