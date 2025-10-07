declare module "ink" {
  import type { FunctionComponent, ReactNode } from "react";

  interface TextProps {
    readonly children?: ReactNode;
  }

  export const Text: FunctionComponent<TextProps>;
}
