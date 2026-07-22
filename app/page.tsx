import properties from "@/data/properties.json";
import { Property, Z1Landing } from "@/components/z1-landing";

export default function Home() {
  return <Z1Landing properties={properties as Property[]} />;
}
