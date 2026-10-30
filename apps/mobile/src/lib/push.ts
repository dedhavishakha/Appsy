import { createContext, useContext } from "react";

// Push notifications as the app's screens see them (components/push-provider.tsx).
export type Push = {
  // Whether the store's app offers notifications: the store switched them on (Appsy's
  // Functionality page), and this isn't the editor's preview.
  offered: boolean;
  // The shopper said yes and the phone allows them.
  on: boolean;
  // Turning them on asks the phone; turning them off asks Appsy to forget this phone.
  setOn: (on: boolean) => void;
  // Shown under Privacy choices while notifications are on, for test sends from Appsy.
  testCode: string | null;
  // The first time the shopper adds to their bag, the app asks about notifications.
  afterAddToBag: () => void;
  // An order was placed, so the bag reminder goes.
  orderPlaced: () => void;
};

export const PushContext = createContext<Push>({
  offered: false,
  on: false,
  setOn: () => {},
  testCode: null,
  afterAddToBag: () => {},
  orderPlaced: () => {},
});

export function usePush(): Push {
  return useContext(PushContext);
}
