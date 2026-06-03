// Locks in 2026-06-03 frontend fixes:
//   - Legacy mode toggle shows the 10-button text grid, not the image-based DemoBodyHeatmap
//   - The legacy body-btn buttons have a click handler that sets selectedBody
//   - Language dropdown uses position:fixed on small phones so the overflow-x:auto
//     nav doesn't clip it
const fs = require('fs');
const path = require('path');

describe('Frontend: legacy mode + mobile lang dropdown', () => {
  let html;
  let css;

  beforeAll(() => {
    const htmlPath = path.join(__dirname, '../IIndex.html');
    html = fs.readFileSync(htmlPath, 'utf8');
    // Extract the <style> block to test CSS rules.
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    css = styleMatch ? styleMatch[1] : '';
  });

  describe('Legacy mode toggle shows the 10-button text grid', () => {
    it('wireHeatmapModeToggle demo branch hides the 2D container and shows #legacy-body-grid', () => {
      // The fix: the demo (legacy) branch must NOT instantiate a
      // DemoBodyHeatmap. It should hide the image-based container and
      // show the existing 10-button text grid.
      const fnMatch = html.match(/function wireHeatmapModeToggle\(\)\s*\{[\s\S]*?\n\}/);
      expect(fnMatch).not.toBeNull();
      const fn = fnMatch[0];
      expect(fn).toMatch(/mode === 'demo'/);
      expect(fn).toMatch(/legacy-body-grid/);
      expect(fn).toMatch(/container\.style\.display = 'none'/);
      // The old behaviour that broke the toggle — creating a DemoBodyHeatmap
      // when the user wants the text grid — must be gone.
      expect(fn).not.toMatch(/new DemoBodyHeatmap\(/);
    });

    it('switching back to 2D re-shows the image container and hides the grid', () => {
      const fnMatch = html.match(/function wireHeatmapModeToggle\(\)\s*\{[\s\S]*?\n\}/);
      const fn = fnMatch[0];
      expect(fn).toMatch(/legacyGrid\.style\.display = 'none'/);
      expect(fn).toMatch(/container\.style\.display = ''/);
    });

    it('legacy body-btn buttons have a click handler that sets selectedBody', () => {
      // Without this handler the grid was unclickable. Regression for the
      // 2026-06 report: "the legacy mode is not appearing".
      expect(html).toMatch(/querySelectorAll\(['"]#legacy-body-grid \.body-btn['"]\)/);
      expect(html).toMatch(/selectedBody = b\.dataset\.val/);
    });

    it('legacy-body-grid markup still exists with the 10 area buttons', () => {
      expect(html).toMatch(/id="legacy-body-grid"/);
      for (const label of ['Skin / Face', 'Eyes', 'Throat / Mouth', 'Chest / Lungs',
        'Stomach / Gut', 'Arms / Hands', 'Legs / Feet', 'Head / Nervous',
        'Whole Body', 'Other / Unsure']) {
        expect(html).toContain(label);
      }
    });
  });

  describe('Language dropdown on mobile (max-width: 480px)', () => {
    it('CSS uses position:fixed for .lang-dropdown inside the small-phone media query', () => {
      // The fix: nav-right has overflow-x:auto on small phones, which
      // clips the absolutely-positioned .lang-dropdown. The mobile rule
      // switches the dropdown to position:fixed so it escapes the
      // scroll container.
      const mobileMq = css.match(/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\}\s*\}/);
      expect(mobileMq).not.toBeNull();
      expect(mobileMq[0]).toMatch(/\.lang-dropdown\s*\{[^}]*position:\s*fixed/);
    });
  });
});
