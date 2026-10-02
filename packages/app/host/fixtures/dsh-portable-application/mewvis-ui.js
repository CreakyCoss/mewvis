document.body.innerHTML = `
  <main>
    <h1>Portable UI Fixture</h1>
    <form>
      <label>Message <input name="message" required /></label>
      <button type="submit">Echo</button>
    </form>
    <output></output>
  </main>
`;

const form = document.querySelector("form");
const output = document.querySelector("output");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const result = await window.mewvisApplication.executeTool("mewvis_dsh_echo", {
    message: String(data.get("message") || ""),
    prefix: "ui",
  });
  output.textContent = result.value;
});
