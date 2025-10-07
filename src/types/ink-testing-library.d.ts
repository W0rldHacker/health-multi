declare module "ink-testing-library" {
  import type { ReactElement } from "react";

  export interface InkRenderInstance {
    readonly lastFrame: () => string | undefined;
    readonly unmount: () => void;
  }

  export function render(tree: ReactElement): InkRenderInstance;
}
