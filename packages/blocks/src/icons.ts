// Icons merchants can pick for features and trust messages. The ids are Appsy's own, so
// the phone app can change its icon set without touching any design.
export const ICON_LABELS = {
  delivery: "Delivery",
  returns: "Returns",
  secure: "Secure payment",
  support: "Support",
  gift: "Gift",
  star: "Star",
  quality: "Quality",
  eco: "Eco-friendly",
  heart: "Heart",
  warranty: "Warranty",
  fast: "Fast",
  offer: "Offer",
  payment: "Payment",
  worldwide: "Worldwide",
  package: "Package",
} as const;

export type IconName = keyof typeof ICON_LABELS;

// Icons for links in the side menu, including social networks' logos.
export const LINK_ICON_LABELS = {
  link: "Link",
  store: "Store",
  calendar: "Calendar",
  location: "Location",
  info: "Information",
  help: "Help",
  chat: "Chat",
  news: "News",
  gift: "Gift",
  offer: "Offer",
  star: "Star",
  heart: "Heart",
  delivery: "Delivery",
  returns: "Returns",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
} as const;

export type LinkIconName = keyof typeof LINK_ICON_LABELS;
