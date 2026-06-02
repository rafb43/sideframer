// Renders the keyboard-shortcut help page. Dynamically imported on demand
// so the diagrammer bundle stays light when no one opens help.

interface Shortcut {
  keys: string[];
  desc: string;
}

interface Section {
  title: string;
  shortcuts: Shortcut[];
}

const SECTIONS: Section[] = [
  {
    title: "modes",
    shortcuts: [
      { keys: ["g"], desc: "open gallery" },
      { keys: ["v"], desc: "view (read-only)" },
      { keys: ["d"], desc: "draw" },
      { keys: ["c"], desc: "connect" },
      { keys: ["esc"], desc: "return to view (or close overlay page)" },
    ],
  },
  {
    title: "pages",
    shortcuts: [
      { keys: ["?"], desc: "this help page" },
      { keys: [">"], desc: "design system / components" },
      { keys: ["esc"], desc: "close overlay and return to previous mode" },
    ],
  },
  {
    title: "draw mode",
    shortcuts: [
      { keys: ["click"], desc: "add a box on the empty canvas (or clear selection)" },
      { keys: ["click box"], desc: "select a box (focus moves to its label)" },
      { keys: ["drag"], desc: "move a selected box" },
      { keys: ["delete", "backspace"], desc: "remove the selected box" },
    ],
  },
  {
    title: "connect mode",
    shortcuts: [
      { keys: ["click", "click"], desc: "link two boxes (or the center)" },
      { keys: ["click arrow"], desc: "select a connector" },
      { keys: ["delete", "backspace"], desc: "remove the selected connector" },
    ],
  },
];

export function renderHelpPage(root: HTMLElement): void {
  root.innerHTML = `
    <div class="help-page">
      <header class="help-header">
        <h1>keyboard shortcuts</h1>
        <p class="help-note">press <kbd>esc</kbd> to close this page and return to where you were.</p>
      </header>
      ${SECTIONS.map(renderSection).join("")}
    </div>
  `;
}

function renderSection(s: Section): string {
  return `
    <section class="help-section">
      <h2>${s.title}</h2>
      <dl class="help-list">
        ${s.shortcuts.map((sc) => `
          <dt>${sc.keys.map((k) => `<kbd>${k}</kbd>`).join(" <span class=\"help-plus\">+</span> ")}</dt>
          <dd>${sc.desc}</dd>
        `).join("")}
      </dl>
    </section>
  `;
}
