// Inline, render-blocking script that sets data-theme before first paint so the theme never
// flashes. Reads localStorage('theme'); defaults to dark. (Same behavior as the explorer.)
const SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
