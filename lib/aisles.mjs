/*
 * Supermarket aisles for the shopping list in My kitchen.
 *
 * aisleOf(name) puts an ingredient name ("2 red onions" style names from
 * aggregateIngredients) into one aisle. Rules run top to bottom and the first
 * match wins, so the specific ones come first: "chicken stock" is a stock
 * cube, not meat; "garlic powder" is a spice, not veg; "coconut milk" comes
 * in a tin, not from the dairy fridge. Anything unknown goes to "other".
 * Tests: node scripts/test-aisles.mjs
 */

/** Display order, roughly a walk through a UK supermarket. */
export const AISLES = [
  { id: "produce", label: "Fruit & veg", emoji: "🥬" },
  { id: "bakery", label: "Bread", emoji: "🥖" },
  { id: "meat", label: "Meat & fish", emoji: "🍗" },
  { id: "dairy", label: "Dairy, eggs & chilled", emoji: "🧀" },
  { id: "dry", label: "Rice, pasta & baking", emoji: "🍝" },
  { id: "tins", label: "Oils, sauces & tins", emoji: "🥫" },
  { id: "spices", label: "Spices & seasoning", emoji: "🧂" },
  { id: "frozen", label: "Frozen", emoji: "🧊" },
  { id: "drinks", label: "Drinks", emoji: "🍷" },
  { id: "other", label: "Other", emoji: "🛒" },
];

const words = (list) => new RegExp(`\\b(?:${list.join("|")})\\b`);

const HERBS = "basil|parsley|coriander|mint|dill|chives?|thyme|rosemary|sage|tarragon|oregano|bay lea(?:f|ves)";

// [aisle, regex]; first match wins.
const RULES = [
  // Not something you buy.
  ["other", /^(?:(?:cold|boiling|hot|warm|lukewarm|tepid|ice[- ]cold|sparkling) )?water$|^ice(?: cubes?)?$/],
  ["frozen", words(["frozen", "ice cream", "sorbet"])],
  // Packaging beats everything else: a can of tomatoes lives with the tins.
  ["tins", words(["cans?", "tins?", "tinned", "canned", "jars?", "jarred", "pickled", "bottled"])],

  // Specific names that the broad rules below would get wrong.
  ["bakery", words(["tortillas?", "tortilla wraps?"])],
  ["dry", words(["vanilla", "cocoa", "baking powder", "baking soda", "bicarbonate of soda", "protein powder", "nutritional yeast", "yeast", "egg noodles?", "breadcrumbs?", "panko", "rice noodles?", "rice paper"])],
  ["tins", words(["stock cubes?", "stock pots?", "(?:peanut|almond|cashew|nut) butter", "rice (?:wine )?vinegar", "coconut (?:milk|cream)", "roasted red peppers?", "sun-?dried tomato(?:es)?", "tomato pur[eé]e", "tomato paste"])],
  ["produce", words(["garlic cloves?", "curry lea(?:f|ves)", "lemon juice", "lime juice", "orange juice", "lemon zest", "lime zest", "corn on the cob", "pomegranate seeds", "sugar snap(?: peas?)?", "sweet potato(?:es)?"])],
  ["dairy", words(["(?:oat|almond|soy|soya|cashew|hazelnut) milk", "(?:oat|soy|soya) cream"])],
  ["spices", new RegExp(`\\bdried (?:${HERBS}|mixed herbs)\\b`)],

  ["spices", words([
    "salt", "msg", "ground (?!beef|pork|lamb|turkey|chicken|almonds?)[a-z]+", "peppercorns?", "(?:black|white|ground|cayenne|lemon|sichuan|szechuan) pepper",
    "paprika", "cumin", "turmeric", "cinnamon", "nutmeg", "garam masala", "curry powder",
    "chilli powder", "chili powder", "[a-z]+ flakes", "chilli flakes", "pul biber", "gochugaru",
    "cayenne", "five[- ]spice", "sumac", "za[’']?atar", "ras el hanout", "7[- ]spice", "seven spice",
    "allspice", "mixed spice", "cardamom", "cloves?", "star anise", "fennel seeds?",
    "coriander seeds?", "cumin seeds?", "mustard seeds?", "nigella seeds?", "caraway",
    "fenugreek", "saffron", "seasoning", "powder", "herbes de provence", "italian herbs",
    "mixed herbs", "bay lea(?:f|ves)", "smoked salt", "celery salt", "onion granules",
    "garlic granules", "dukkah", "baharat", "berbere", "chaat masala", "amchur",
  ])],

  ["tins", words([
    "stock", "broth", "gravy", "bouillon", "[a-z]+ sauce", "sauce", "sriracha", "ketchup",
    "mayonnaise", "mayo", "mustard", "vinegar", "oil", "honey", "maple syrup", "golden syrup",
    "agave(?: nectar| syrup)?", "syrup", "molasses", "treacle", "tahini", "capers?", "olives?",
    "cornichons?", "gherkins?", "passata", "chopped tomato(?:es)?", "plum tomato(?:es)?",
    "chickpeas?", "(?:butter|black|kidney|cannellini|borlotti|haricot|pinto|baked|refried|black-eyed) beans?",
    "pur[eé]e", "paste", "harissa", "pesto", "chutney", "relish", "jam", "marmalade",
    "miso", "gochujang", "doubanjiang", "mirin", "shaoxing(?: wine)?", "sake",
    "nori", "seaweed", "anchov(?:y|ies)", "tuna", "sardines?", "crispy fried onions?",
    "fried shallots?", "chipotle", "kecap manis", "lea & perrins", "worcestershire",
    "hoisin", "teriyaki", "ponzu", "tamari", "salsa", "dressing", "crisps", "tortilla chips",
  ])],

  ["dry", words([
    "flour", "cornflour", "cornstarch", "cornmeal", "polenta", "semolina", "sugar", "icing",
    "rice", "pasta", "spaghetti", "linguine", "fettuccine", "tagliatelle", "pappardelle",
    "penne", "rigatoni", "fusilli", "farfalle", "conchiglie", "orecchiette", "macaroni",
    "orzo", "lasagne(?: sheets?)?", "lasagna", "gnocchi", "noodles?", "udon", "soba", "ramen",
    "vermicelli", "couscous", "quinoa", "bulgur(?: wheat)?", "freekeh", "barley", "farro",
    "oats?", "rolled oats?", "granola", "lentils?", "split peas?", "(?:dark|milk|white) chocolate",
    "chocolate(?: chips)?", "peanuts?", "almonds?", "cashews?", "walnuts?", "pistachios?",
    "hazelnuts?", "pecans?", "pine nuts?", "macadamias?", "nuts?", "seeds?", "sesame",
    "desiccated coconut", "coconut flakes", "raisins?", "sultanas?", "currants?", "dates?",
    "dried (?:apricots?|cranberries|figs?|fruit|mango)", "prunes?", "crackers?", "biscuits?",
    "digestives?", "gelatine", "cornflakes", "puffed rice", "rice cakes?",
  ])],

  ["bakery", words([
    "bread", "sourdough", "ciabatta", "baguette", "brioche", "buns?", "rolls?", "pittas?",
    "pitas?", "flatbreads?", "naans?", "bagels?", "focaccia", "crumpets?", "wraps?",
    "croissants?", "muffins?", "tortilla", "chapatis?", "rotis?", "loaf", "toast", "bao",
  ])],

  ["dairy", words([
    "milk", "butter", "buttermilk", "cream", "cr[eè]me fra[iî]che", "yogh?urt", "yogurt",
    "cheese", "cheddar", "parmesan", "parmigiano", "pecorino", "grana padano", "mozzarella",
    "feta", "halloumi", "ricotta", "mascarpone", "burrata", "paneer", "gruy[eè]re", "brie",
    "camembert", "goat'?s cheese", "stilton", "gorgonzola", "manchego", "emmental", "comt[eé]",
    "labneh", "quark", "skyr", "kefir", "eggs?", "egg yolks?", "egg whites?", "ghee",
    "tofu", "tempeh", "seitan", "hummus", "houmous", "kimchi", "sauerkraut", "puff pastry",
    "shortcrust pastry", "filo(?: pastry)?", "phyllo", "pastry", "custard", "fresh pasta",
    "tzatziki", "guacamole", "crème", "creme",
  ])],

  ["meat", words([
    "chicken", "beef", "pork", "lamb", "mince", "sausages?", "bacon", "pancetta", "lardons",
    "chorizo", "nduja", "'nduja", "ham", "prosciutto", "parma ham", "serrano", "salami",
    "pepperoni", "guanciale", "steak", "turkey", "duck", "veal", "venison", "goat", "mutton",
    "oxtail", "brisket", "short ribs?", "ribs?", "fillets?", "thighs?", "drumsticks?", "wings?",
    "breast", "salmon", "cod", "haddock", "hake", "pollock", "mackerel", "trout", "sea bass",
    "seabass", "sea bream", "tuna steaks?", "swordfish", "monkfish", "halibut", "plaice",
    "prawns?", "shrimps?", "mussels?", "clams?", "squid", "calamari", "octopus", "scallops?",
    "crab", "lobster", "langoustines?", "fish", "smoked fish", "kippers?", "black pudding",
    "liver", "merguez", "kielbasa", "frankfurters?", "hot dogs?", "meatballs?",
  ])],

  ["drinks", words([
    "wine", "vodka", "beer", "lager", "ale", "stout", "rum", "gin", "tequila", "mezcal",
    "whisky", "whiskey", "bourbon", "brandy", "cognac", "sherry", "port", "prosecco",
    "champagne", "cava", "cider", "vermouth", "campari", "aperol", "triple sec", "cointreau",
    "amaretto", "kahl[uú]a", "liqueur", "soda water", "tonic", "ginger beer", "cola",
    "lemonade", "coffee", "espresso", "tea", "matcha", "kombucha", "juice",
  ])],

  ["produce", new RegExp(`\\b(?:${HERBS})\\b`)],
  ["produce", words([
    "onions?", "shallots?", "garlic", "ginger", "lemongrass", "galangal", "lemons?", "limes?",
    "oranges?", "clementines?", "satsumas?", "grapefruit", "chill(?:i|ies|y)", "chili",
    "jalape[nñ]os?", "scotch bonnets?", "peppers?", "tomato(?:es)?", "cucumbers?", "carrots?",
    "celery", "celeriac", "spinach", "kale", "cavolo nero", "chard", "courgettes?",
    "zucchini", "aubergines?", "eggplants?", "avocados?", "potato(?:es)?", "sweet potato(?:es)?",
    "squash", "pumpkin", "mushrooms?", "broccoli", "tenderstem", "cauliflower", "cabbage",
    "lettuce", "baby gem", "little gem", "romaine", "iceberg", "rocket", "arugula",
    "watercress", "salad", "leeks?", "fennel", "spring onions?", "scallions?", "beetroot",
    "beets?", "radish(?:es)?", "turnips?", "parsnips?", "swede", "asparagus", "peas?",
    "green beans?", "runner beans?", "broad beans?", "edamame", "sugar snap(?: peas?)?",
    "mangetout", "sweetcorn", "corn", "okra", "pak choi", "bok choy", "beansprouts?",
    "bean sprouts?", "sprouts?", "brussels sprouts?", "artichokes?", "plantains?",
    "mangoes?", "mangos?", "bananas?", "apples?", "pears?", "pineapples?", "strawberr(?:y|ies)",
    "raspberr(?:y|ies)", "blueberr(?:y|ies)", "blackberr(?:y|ies)", "berries", "cherr(?:y|ies)",
    "grapes?", "peach(?:es)?", "nectarines?", "plums?", "apricots?", "figs?", "kiwis?",
    "melons?", "watermelon", "pomegranates?", "passion ?fruits?", "lychees?", "rhubarb",
    "coconut", "herbs?", "microherbs", "cress", "shiso", "thai basil",
  ])],
];

/** Aisle id for an ingredient name. */
export function aisleOf(name) {
  const n = String(name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}&'’ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return "other";
  for (const [aisle, re] of RULES) if (re.test(n)) return aisle;
  return "other";
}

/**
 * Splits shopping list items into aisles, in AISLES order, keeping the order
 * of items inside each aisle. Returns [{ ...aisle, items }] without empty ones.
 */
export function groupByAisle(items, nameOf = (i) => i.name) {
  const by = new Map(AISLES.map((a) => [a.id, []]));
  for (const item of items) by.get(aisleOf(nameOf(item))).push(item);
  return AISLES.map((a) => ({ ...a, items: by.get(a.id) })).filter((g) => g.items.length);
}

/**
 * Plain text for sending the list to someone (Messages, Notes...).
 * `groups` from groupByAisle, `labelOf` gives one line per item.
 */
export function shoppingListText(groups, labelOf = (i) => i.label) {
  const parts = groups.map(
    (g) => `${g.emoji} ${g.label}\n${g.items.map((i) => `• ${labelOf(i)}`).join("\n")}`,
  );
  return parts.join("\n\n");
}
