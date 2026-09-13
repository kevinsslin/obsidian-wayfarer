import { App, Modal, Setting } from "obsidian";

/** Asks for a start date and a length, then hands back the pair. */
export class NewTripModal extends Modal {
  private start = new Date().toISOString().slice(0, 10);
  private days = 7;

  constructor(app: App, private onSubmit: (start: Date, days: number) => void) {
    super(app);
  }

  onOpen(): void {
    this.setTitle("New trip");
    new Setting(this.contentEl).setName("First day").addText((t) => {
      t.inputEl.type = "date";
      t.setValue(this.start).onChange((v) => (this.start = v));
    });
    new Setting(this.contentEl).setName("Number of days").addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.min = "1";
      t.inputEl.max = "60";
      t.setValue(String(this.days)).onChange((v) => (this.days = Math.max(1, Math.min(60, Number(v) || 1))));
    });
    new Setting(this.contentEl).addButton((b) =>
      b.setButtonText("Insert day headings").setCta().onClick(() => {
        const [y, m, d] = this.start.split("-").map(Number);
        if (!y || !m || !d) return;
        this.close();
        this.onSubmit(new Date(y, m - 1, d), this.days);
      }),
    );
  }
}
