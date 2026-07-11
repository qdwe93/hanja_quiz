import hanjaData from "../data/hanja.json";
import { HanjaApp } from "../components/HanjaApp";
import type { HanjaEntry } from "../lib/types";

export default function Home() {
  return <HanjaApp entries={hanjaData as HanjaEntry[]} />;
}
