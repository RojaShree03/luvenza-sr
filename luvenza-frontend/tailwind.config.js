/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {
    colors: {
      plum: { 50:"#f8f1f5", 100:"#efdee8", 200:"#dfbfd0", 300:"#c995b2", 400:"#ad6b91", 500:"#8b4b70", 600:"#6f3858", 700:"#54283f", 800:"#402032", 900:"#2b1623" },
      cream: "#fbf8f6"
    },
    fontFamily: { display: ["Georgia", "serif"] },
    boxShadow: { soft: "0 12px 35px rgba(72,38,57,.08)" }
  }},
  plugins: []
};