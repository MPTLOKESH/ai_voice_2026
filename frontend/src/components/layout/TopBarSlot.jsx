import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

/** The element in the top bar where the page on screen puts its own actions. */
export const TopBarSlotContext = createContext(null);

/** Render children into the top bar, so each page owns the actions that belong to it. */
export function TopBarActions({ children }) {
  const slot = useContext(TopBarSlotContext);
  return slot ? createPortal(children, slot) : null;
}
