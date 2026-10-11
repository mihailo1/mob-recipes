// Data tables for ingredient normalization (see lib/ingredients.mjs).
// Everything here is written in canonical form: lowercase, singular, UK
// spelling (the source site is mob.co.uk). Keys in the synonym tables are
// ALREADY singularized, because they are applied after singularization.

/** Words that must never be singularized (end in "s" but are singular). */
export const KEEP_PLURAL = new Set([
  "hummus", "couscous", "asparagus", "molasses", "swiss", "watercress", "cress",
  "lemongrass", "citrus", "tahini", "harissa", "chorizo", "gas", "bass", "glass",
  "grass", "moss", "boursin", "mascarpone", "polenta", "brussels", "series",
  "ras", "pastis", "hass", "hollandaise", "bearnaise", "swede", "this", "plus",
]);

/** Explicit irregular plurals / singular fixes (applied before the suffix rules). */
export const IRREGULAR = {
  leaves: "leaf", loaves: "loaf", halves: "half", knives: "knife", calves: "calf",
  cookies: "cookie", brownies: "brownie", smoothies: "smoothie", veggies: "veggie",
  pies: "pie", chillies: "chilli", chilies: "chilli", chiles: "chilli", chilis: "chilli",
  anchovies: "anchovy", mice: "mouse", geese: "goose", teeth: "tooth",
  noodles: "noodle", olives: "olive", cloves: "clove", chives: "chive", wedges: "wedge",
  tomatoes: "tomato", potatoes: "potato", mangoes: "mango", avocados: "avocado",
  dates: "date", sprouts: "sprout", oats: "oat", peas: "pea", beans: "bean",
};

/**
 * Single-word synonyms: variant (singular) -> canonical (may be several words).
 * Canonical choice follows UK usage.
 */
export const WORD_SYNONYMS = {
  cilantro: "coriander",
  eggplant: "aubergine",
  brinjal: "aubergine",
  zucchini: "courgette",
  scallion: "spring onion",
  shrimp: "prawn",
  garbanzo: "chickpea",
  arugula: "rocket",
  rucola: "rocket",
  chili: "chilli",
  chile: "chilli",
  chilly: "chilli",
  chillie: "chilli",
  yogurt: "yoghurt",
  yoghourt: "yoghurt",
  capsicum: "pepper",
  beet: "beetroot",
  rutabaga: "swede",
  cornstarch: "cornflour",
  bicarb: "bicarbonate of soda",
  catsup: "ketchup",
  romaine: "cos",
  mayo: "mayonnaise",
  parmigiano: "parmesan",
  filet: "fillet",
};

/**
 * Multi-word synonyms, applied on the singularized token string with word
 * boundaries, longest source first. [from, to]
 */
export const PHRASE_SYNONYMS = [
  ["sun dried tomato", "sundried tomato"],
  ["sun dried", "sundried"],
  ["sun blushed", "sunblushed"],
  ["green onion", "spring onion"],
  ["salad onion", "spring onion"],
  ["garbanzo bean", "chickpea"],
  ["chick pea", "chickpea"],
  ["bell pepper", "pepper"],
  ["sweet corn", "sweetcorn"],
  ["corn starch", "cornflour"],
  ["corn flour", "cornflour"],
  ["all purpose flour", "plain flour"],
  ["ap flour", "plain flour"],
  ["self rising flour", "self raising flour"],
  ["whole wheat flour", "wholemeal flour"],
  ["whole wheat", "wholemeal"],
  ["powdered sugar", "icing sugar"],
  ["confectioner sugar", "icing sugar"],
  ["confectioners sugar", "icing sugar"],
  ["superfine sugar", "caster sugar"],
  ["heavy cream", "double cream"],
  ["heavy whipping cream", "double cream"],
  ["light cream", "single cream"],
  ["half and half", "single cream"],
  ["baking soda", "bicarbonate of soda"],
  ["tomato paste", "tomato puree"],
  ["bok choy", "pak choi"],
  ["pak choy", "pak choi"],
  ["snow pea", "mangetout"],
  ["mange tout", "mangetout"],
  ["fava bean", "broad bean"],
  ["canola oil", "rapeseed oil"],
  ["lady finger", "okra"],
  ["cos lettuce", "cos lettuce"],
  ["cos heart", "cos lettuce"],
  ["parmesan reggiano", "parmesan"],
  ["parmesan cheese", "parmesan"],
  ["coriander leaf", "coriander"],
  ["coriander herb", "coriander"],
  ["garlic clove", "garlic"],
  ["clove garlic", "garlic"],
  ["clove of garlic", "garlic"],
  ["lemon grass", "lemongrass"],
  ["bouillon cube", "stock cube"],
  ["chicken broth", "chicken stock"],
  ["beef broth", "beef stock"],
  ["vegetable broth", "vegetable stock"],
  ["veg stock", "vegetable stock"],
  ["fish broth", "fish stock"],
  ["lamb broth", "lamb stock"],
  ["pork broth", "pork stock"],
  ["wholewheat", "wholemeal"],
];

/** "ground/minced <meat>" -> "<meat> mince". */
export const MINCE_MEATS = ["beef", "pork", "lamb", "turkey", "chicken", "veal", "venison", "duck"];

/**
 * Multi-word descriptors removed wholesale (singularized, space separated).
 * They carry no ingredient identity ("Bone-In Skin-On Chicken Thigh").
 */
export const STRIP_PHRASES = [
  "bone in", "skin on", "skin off", "skin side down", "free range", "extra virgin",
  "pre chopped", "pre cooked", "pre cut", "pre sliced", "pre washed", "pre baked",
  "ready to eat", "good quality", "best quality", "high quality", "to taste", "to serve",
  "plus extra", "for frying", "for serving", "for garnish", "for dusting", "for greasing",
  "cut into", "room temperature", "shell on", "shell off", "full fat", "low fat",
  "reduced fat", "fat free", "half fat", "low salt", "reduced salt", "extra lean",
];

/** Single words removed (prep methods, sizes, packaging, quality adjectives). */
export const STRIP_WORDS = new Set([
  "fresh", "freshly", "frozen", "dried", "ground", "chopped", "sliced", "crushed",
  "grated", "cooked", "uncooked", "raw", "peeled", "diced", "minced", "finely",
  "roughly", "coarsely", "thinly", "thickly", "large", "small", "medium", "big",
  "ripe", "lean", "boneless", "skinless", "organic", "premium", "toasted", "roasted",
  "blanched", "shelled", "pitted", "stoned", "halved", "quartered", "shredded",
  "torn", "crumbled", "mashed", "smashed", "trimmed", "deseeded", "seeded",
  "drained", "rinsed", "softened", "melted", "chilled", "warm", "boiling", "leftover",
  "reserved", "optional", "extra", "can", "tin", "tinned", "canned", "jar", "jarred",
  "packet", "pack", "sachet", "bag", "bunch", "handful", "pinch", "sprig", "knob",
  "dash", "splash", "drizzle", "piece", "chunk", "wedge", "stick", "whole",
  "a", "an", "the", "and", "or", "about", "approx",
  "x", "per", "each", "tbsp", "tsp", "g", "kg", "ml", "l", "cm", "mm",
]);

/**
 * A recipe ingredient phrase whose LAST words are one of these is a derived
 * product ("chicken stock", "olive oil", "soy sauce"): selecting the leading
 * word ("chicken", "olive", "soy") must not match it, but selecting the head
 * itself ("stock", "oil", "chicken stock") does.
 */
export const DERIVED_HEAD_RE =
  /(?:^| )(stock|bouillon|broth|gravy|seasoning|oil|vinegar|sauce|ketchup)(?: (?:cube|pot|powder|concentrate|granule|mix))?$/;

/**
 * Compounds where a contained word names something else, so the sub-term
 * must not match: phrase -> terms that do NOT match inside it.
 */
/** Tokens that cut the name short when they appear after the first word ("tuna in oil" -> "tuna"). */
export const CUT_WORDS = new Set(["in", "with", "for", "to", "plus", "from", "such", "like"]);

export const COMPOUND_BLOCKS = {
  "peanut butter": ["butter"],
  "almond butter": ["butter"],
  "cashew butter": ["butter"],
  "nut butter": ["butter"],
  "cocoa butter": ["butter"],
  "apple butter": ["butter"],
  "butter bean": ["butter", "bean"],
  "butter lettuce": ["butter", "lettuce"],
  "coconut milk": ["milk"],
  "coconut cream": ["cream", "milk"],
  "almond milk": ["milk"],
  "oat milk": ["milk"],
  "soya milk": ["milk"],
  "soy milk": ["milk"],
  "rice milk": ["milk"],
  "cashew milk": ["milk"],
  "sour cream": ["cream"],
  "ice cream": ["cream"],
  "cream cheese": ["cream"],
  "cream cracker": ["cream"],
  "cream of tartar": ["cream"],
  "egg noodle": ["egg"],
  "black pepper": ["pepper"],
  "white pepper": ["pepper"],
  "cayenne pepper": ["pepper"],
  "sichuan pepper": ["pepper"],
  "szechuan pepper": ["pepper"],
  "lemon pepper": ["pepper"],
  "lime leaf": ["lime"],
  "lime pickle": ["lime"],
  "bay leaf": ["bay"],
  "curry leaf": ["curry"],
  "curry powder": ["curry"],
  "curry paste": ["curry"],
  "sweet potato": ["potato"],
  "sweet chilli": ["chilli"],
  "baking powder": ["powder"],
  "chilli powder": ["powder"],
};
