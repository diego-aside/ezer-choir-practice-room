const crypto = require('crypto');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const password = body && typeof body.password === 'string' ? body.password : '';
  const expected = process.env.TEACHER_PASSWORD || '';
  await sleep(300); // 무차별 대입 지연
  // 길이가 달라도 timingSafeEqual을 쓸 수 있도록 해시끼리 비교한다.
  const same = crypto.timingSafeEqual(digest(password), digest(expected));
  return res.status(200).json({ ok: Boolean(expected) && password.length > 0 && same });
};
