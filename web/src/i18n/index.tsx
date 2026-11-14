import { createContext, useContext, useState, type ReactNode } from "react";
import es from "./es.json";
import en from "./en.json";

export type Lang = "es" | "en";
const DICTS: Record<Lang, Record<string, string>> = { es, en };

type I18n = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18n>({
  lang: "es",
  setLang: () => {},
  t: (k) => k,
});

const LS_KEY = "fs_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const v = localStorage.getItem(LS_KEY);
    return v === "en" || v === "es" ? v : "es";
  });
  const setLang = (l: Lang) => {
    localStorage.setItem(LS_KEY, l);
    setLangState(l);
  };
  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][key] ?? DICTS.es[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
