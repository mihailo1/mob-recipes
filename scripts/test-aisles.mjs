#!/usr/bin/env node
// Exercises lib/aisles.mjs (shopping list aisles). No I/O.
// Usage: node scripts/test-aisles.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import { AISLES, aisleOf, groupByAisle, shoppingListText } from "../lib/aisles.mjs";

const cases = {
  produce: [
    "red onion", "garlic clove", "Coriander", "coriander (to serve)", "lemon juice", "red chilli",
    "cherry tomatoes", "bell pepper", "red pepper", "sweet potato", "butternut squash",
    "pomegranate seeds", "sugar snap pea", "corn on the cob", "curry leaf", "thai basil",
    "green bean", "oyster mushroom", "watercress", "Fresh Dill",
  ],
  bakery: ["sourdough", "flour tortilla", "corn tortilla", "brioche bun", "pitta", "strong white bread"],
  meat: ["chicken breast", "beef mince", "king prawns", "skin-on salmon fillet", "pork belly", "nduja"],
  dairy: [
    "egg", "egg yolk", "unsalted butter", "greek yoghurt", "crème fraîche", "oat milk",
    "firm tofu", "puff pastry", "parmesan (to serve)", "full-fat cottage cheese",
  ],
  dry: [
    "plain flour", "strong white bread flour", "caster sugar", "jasmine rice", "egg noodle",
    "panko breadcrumbs", "rice noodle", "pine nuts", "sesame seeds", "vanilla extract",
    "cocoa powder", "baking powder", "dark chocolate", "puy lentils",
  ],
  tins: [
    "olive oil", "soy sauce", "fish sauce", "chicken stock", "vegetable stock cube",
    "coconut milk", "can chopped tomatoes", "can butter beans", "drained cooked chickpeas",
    "peanut butter", "rice vinegar", "rice wine vinegar", "tomato purée", "harissa paste",
    "crispy chilli oil", "jar roasted red peppers", "pickled jalapeño", "anchovy", "honey",
  ],
  spices: [
    "salt", "flaky sea salt", "black pepper", "white pepper", "cayenne pepper", "smoked paprika",
    "chilli flakes", "garlic powder", "ground coriander", "coriander seed", "clove",
    "cinnamon stick", "za’atar", "bay leaf", "dried oregano", "sichuan peppercorns",
  ],
  frozen: ["frozen peas", "frozen shelled edamame"],
  drinks: ["white wine", "vodka"],
  other: ["water", "boiling water", "ice cube", "", "xyzzy"],
};
for (const [aisle, names] of Object.entries(cases)) {
  for (const name of names) assert.equal(aisleOf(name), aisle, `${name} -> ${aisleOf(name)}, want ${aisle}`);
}

// Every aisle used by the rules is a known aisle, in a fixed display order.
assert.deepEqual(new Set(AISLES.map((a) => a.id)).size, AISLES.length);

const items = [
  { name: "salt", label: "Salt" },
  { name: "red onion", label: "2 red onions" },
  { name: "chicken thigh", label: "500g chicken thigh" },
  { name: "lime", label: "1 lime" },
];
const groups = groupByAisle(items);
assert.deepEqual(
  groups.map((g) => [g.id, g.items.map((i) => i.name)]),
  [
    ["produce", ["red onion", "lime"]],
    ["meat", ["chicken thigh"]],
    ["spices", ["salt"]],
  ],
);
assert.equal(
  shoppingListText(groups),
  "🥬 Fruit & veg\n• 2 red onions\n• 1 lime\n\n🍗 Meat & fish\n• 500g chicken thigh\n\n🧂 Spices & seasoning\n• Salt",
);
assert.deepEqual(groupByAisle([]), []);
console.log("aisle tests passed");
