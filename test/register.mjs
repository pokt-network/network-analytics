// node --test runs the .ts sources directly (type stripping). The app's imports omit the extension and use the
// `@/` alias, as the bundler allows; this resolves both to the .ts file.
import { register } from 'node:module';

register('./resolve-ts.mjs', import.meta.url);
