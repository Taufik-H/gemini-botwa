const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI('AIzaSyDom90A7LUMYHkb4mBVaAiwedGUfx-GqDw');
// harus membuat model dulu

async function run() {
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = 'buatkan ucapan selamat ulang tahun untuk teman saya'
  result = await model.generateContent(prompt)
  const response = await result.response;
  const text = response.text();
  console.log(text);
}

run()