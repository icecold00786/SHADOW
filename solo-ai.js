const clueBank = {
GOLF:["COURSE","CLUB","BALL","OUTDOORS","Players aim carefully before taking a shot"],
CRICKET:["BAT","WICKET","PITCH","TEAM","A match can last for several hours"],
FOOTBALL:["GOAL","KICK","TEAM","STADIUM","Players try to score against the other side"],
TENNIS:["RACKET","NET","COURT","SERVE","Players hit a ball across a net"],
BOXING:["GLOVES","RING","PUNCH","FIGHT","Two opponents compete using their fists"],

RICE:["GRAIN","BOIL","PLATE","FOOD","Often served with curry"],
PIZZA:["CHEESE","SLICE","OVEN","ITALIAN","Usually shared in several pieces"],
BURGER:["BUN","PATTY","CHEESE","FAST FOOD","Often eaten with fries"],
BREAD:["BAKERY","TOAST","SLICES","FLOUR","Commonly eaten at breakfast"],
NOODLES:["STRANDS","SOUP","CHOPSTICKS","BOIL","Can be served in a bowl with vegetables"],

LION:["MANE","ROAR","WILD","PREDATOR","Known for its powerful roar"],
TIGER:["STRIPES","JUNGLE","WILD","HUNTER","A large cat with a striped coat"],
ELEPHANT:["TRUNK","TUSKS","GIANT","HERD","The largest land animal"],
MONKEY:["TAIL","TREES","CLIMB","BANANA","Known for climbing and jumping"],
DOLPHIN:["OCEAN","FINS","INTELLIGENT","MAMMAL","Often seen jumping out of water"],

PEAR:["GREEN","JUICY","SWEET","FRUIT","Has a rounded bottom and narrow top"],
MANGO:["TROPICAL","JUICY","SUMMER","SWEET","A popular seasonal fruit"],
APPLE:["CRUNCHY","RED","ORCHARD","FRUIT","Often used in pies and juice"],
BANANA:["YELLOW","PEEL","BUNCH","SOFT","Easy to carry as a snack"],
GRAPES:["VINE","BUNCH","JUICY","PURPLE","Often used to make juice"],

PARK:["BENCH","TREES","GARDEN","WALK","A place where families relax"],
SCHOOL:["CLASSROOM","STUDENTS","TEACHER","LESSONS","Children visit here to learn"],
HOSPITAL:["DOCTOR","NURSE","PATIENT","TREATMENT","People go here when they need medical care"],
AIRPORT:["RUNWAY","PILOT","LUGGAGE","FLIGHT","A busy place for travellers"],
BEACH:["SAND","WAVES","COAST","HOLIDAY","People visit to relax beside the water"],

LAMP:["LIGHT","SWITCH","BRIGHT","DESK","It helps you see when a room is dark"],
MIRROR:["REFLECTION","GLASS","FACE","FRAME","You can see yourself in it"],
CAMERA:["LENS","PHOTO","FLASH","RECORD","Used to capture special moments"],
CLOCK:["TIME","HANDS","TICK","ALARM","Helps people stay on schedule"],
UMBRELLA:["RAIN","HANDLE","CANOPY","MONSOON","Helps keep you dry outside"],

BIKE:["WHEELS","RIDE","ROAD","HELMET","A convenient way to travel"],
CAR:["ENGINE","DRIVE","ROAD","SEATS","Many families use one for daily travel"],
TRAIN:["TRACKS","RAILWAY","STATION","CARRIAGES","Carries many passengers together"],
AIRPLANE:["WINGS","PILOT","SKY","FLIGHT","Travels long distances above the clouds"],
BICYCLE:["PEDALS","CHAIN","TWO WHEELS","BALANCE","Moves forward when you pedal"],

MOUNTAIN:["PEAK","CLIMB","HEIGHT","SNOW","Some people travel far to reach its top"],
RIVER:["FLOWING","BANKS","WATER","BRIDGE","It travels across the land"],
FOREST:["TREES","WILDLIFE","GREEN","WOODS","Many animals make their homes here"],
DESERT:["SAND","DUNES","DRY","CAMEL","Very little rain falls in this place"],
OCEAN:["WAVES","DEEP","SALT WATER","MARINE","It covers a huge part of Earth"],

DOCTOR:["PATIENT","CLINIC","MEDICAL","HEALTH","Helps people recover from illness"],
TEACHER:["CLASSROOM","STUDENTS","LESSON","EDUCATION","Helps others understand new things"],
POLICE:["UNIFORM","BADGE","LAW","SAFETY","Works to protect the public"],
FARMER:["CROPS","SOIL","HARVEST","FIELD","Works outdoors to grow food"],
CHEF:["KITCHEN","RECIPE","COOKING","RESTAURANT","Creates meals for other people"],

PHONE:["SCREEN","CALL","POCKET","APPS","People use it to communicate every day"],
LAPTOP:["KEYBOARD","SCREEN","PORTABLE","WORK","A computer you can carry around"],
ROBOT:["MACHINE","SENSORS","AUTOMATIC","FUTURE","Can perform tasks with programmed instructions"],
KEYBOARD:["TYPING","BUTTONS","LETTERS","DESK","Used to enter information into a computer"],
TELEVISION:["REMOTE","CHANNEL","SCREEN","ENTERTAINMENT","Families often watch it together"],

PILLOW:["SLEEP","SOFT","BED","COMFORT","Usually placed under your head"],
SOFA:["LIVING ROOM","CUSHIONS","SEATS","RELAX","Several people can sit on it"],
REFRIGERATOR:["COLD","KITCHEN","FOOD","FREEZER","Keeps food fresh for longer"],
BUCKET:["HANDLE","WATER","CARRY","PLASTIC","Useful for moving liquids"],
FAN:["BLADES","AIR","SUMMER","SWITCH","Makes a room feel cooler"],

RAIN:["CLOUDS","DROPS","MONSOON","WET","People often carry protection when it starts"],
THUNDER:["LOUD","STORM","BOOM","LIGHTNING","A sudden sound during a storm"],
RAINBOW:["COLOURS","SKY","ARC","AFTER RAIN","It appears as a colourful curve"],
SNOW:["COLD","WHITE","WINTER","FLAKES","It can cover the ground like a blanket"],
WIND:["BREEZE","AIR","GUST","KITES","You can feel it but cannot see it"],

GUITAR:["STRINGS","MUSIC","PICK","CHORDS","Often played at concerts"],
PIANO:["KEYS","NOTES","MUSIC","MELODY","Can produce both high and low sounds"],
DRUM:["BEAT","RHYTHM","STICKS","PERCUSSION","Often keeps the rhythm in a song"],
FLUTE:["BLOW","MUSIC","TUNE","WIND INSTRUMENT","A melody is made by blowing across it"],
MICROPHONE:["VOICE","SOUND","SPEAKER","RECORDING","Helps a voice reach a large audience"]
};

const styles={
 careful:{short:0.75,aggression:0.65,detail:["I would rather listen before accusing anyone","There may be another explanation","Let's examine the clues carefully"]},
 analytical:{short:0.35,aggression:1,detail:["The details do not completely match","We should compare everyone's clues","There is a pattern worth examining"]},
 bold:{short:0.5,aggression:1.4,detail:["I have a strong suspicion","Someone needs to explain that clue","I am not convinced by that answer"]}
};

const spyShort=[
 "Quite common","Very familiar","Useful every day","I know what you mean",
 "That makes sense","Seen it before","It depends on the situation"
];
const spyLong=[
 "It can be found in many different situations",
 "People may use it in more than one way",
 "I think the other clues are pointing in a similar direction",
 "There are several ways to look at this"
];

function activePlayers(room){
 return room.players.filter(p=>!p.eliminated);
}
function clueText(room,player){
 return String(room.clues[player.id]?.clue||"").trim().toLowerCase();
}
function tokens(value){
 return String(value||"").toLowerCase().match(/[a-z]{3,}/g)||[];
}
function overlap(a,b){
 const aa=[...new Set(tokens(a))],bb=[...new Set(tokens(b))];
 if(!aa.length||!bb.length)return 0;
 return aa.filter(x=>bb.includes(x)).length/Math.max(aa.length,bb.length);
}
function isGeneric(clue){
 return /common|useful|familiar|everyday|depends|many ways|makes sense|seen it/i.test(clue);
}
function insiderMatch(clue,room){
 const expected=clueBank[room.word]||[];
 const c=String(clue||"").toLowerCase();
 return expected.some(word=>c.includes(word.toLowerCase()));
}
function aiClue(room,player){
 const used=Object.values(room.clues).map(x=>String(x.clue).toLowerCase());
 const personality=styles[player.personality]||styles.careful;
 const isSpy=player.aiRole==="SHADOW";
 let choices;
 if(isSpy){
  const source=spyShort.concat(spyLong,personality.detail);
  choices=source.filter(x=>!used.includes(x.toLowerCase()));
  if(!choices.length)choices=source;
 }else{
  const related=clueBank[room.word]||["COMMON","USEFUL","FAMILIAR"];
  choices=related.filter(x=>!used.includes(x.toLowerCase()));
  if(Math.random()>personality.short)choices=choices.concat(personality.detail);
  if(!choices.length)choices=personality.detail.concat(related);
 }
 return choices[Math.floor(Math.random()*choices.length)];
}
function aiDiscussion(room,player){
 const others=Object.entries(room.clues)
  .filter(([id])=>id!==player.id)
  .map(([id,x])=>({id,...x}))
  .filter(x=>activePlayers(room).some(p=>p.id===x.id));
 if(!others.length)return "I want to hear everyone's clues before deciding.";
 const personality=styles[player.personality]||styles.careful;
 const ownRole=player.aiRole;
 const ranked=others.map(target=>{
  const clue=String(target.clue||"");
  let suspicion=0;
  if(!clue)suspicion+=3;
  if(isGeneric(clue))suspicion+=0.8;
  if(ownRole==="INSIDER"&&!insiderMatch(clue,room))suspicion+=1.2;
  const othersClues=others.filter(x=>x.id!==target.id);
  if(othersClues.length){
   const similarity=othersClues.reduce((n,x)=>n+overlap(clue,x.clue),0)/othersClues.length;
   if(similarity<0.12)suspicion+=0.7;
  }
  return {target,suspicion};
 }).sort((a,b)=>b.suspicion-a.suspicion);
 const chosen=ranked[Math.floor(Math.random()*Math.min(2,ranked.length))].target;
 const clue=String(chosen.clue||"");
 const lines={
 careful:[
  chosen.username+", I want to understand your clue \""+clue+"\" a little better.",
  "Let's not rush. "+chosen.username+"'s clue needs a little more explanation.",
  "I am still comparing the clues. Everyone should explain their thinking."
 ],
 analytical:[
  chosen.username+", your clue \""+clue+"\" seems different. How does it connect?",
  "Some clues fit together, but I think we should examine the differences.",
  "We should compare the meaning of each clue instead of guessing."
 ],
 bold:[
  chosen.username+", that clue \""+clue+"\" sounds suspicious to me. Explain it.",
  "I have doubts about one player's clue. We should challenge unclear answers.",
  chosen.username+" needs to explain that choice. I am not fully convinced."
 ]
 };
 const pool=lines[player.personality]||lines.careful;
 return pool[Math.floor(Math.random()*pool.length)];
}
function aiVote(room,player){
 const others=activePlayers(room).filter(p=>p.id!==player.id);
 if(!others.length)return null;
 const ownRole=player.aiRole;
 const personality=styles[player.personality]||styles.careful;
 const allClues=activePlayers(room).map(p=>({
  player:p,clue:clueText(room,p)
 })).filter(x=>x.clue);
 const scores=others.map(target=>{
  const clue=clueText(room,target);
  let score=Math.random()*0.9;
  if(!clue)score+=3;
  if(clue.length<7)score+=0.4;
  if(isGeneric(clue))score+=0.9;
  if(ownRole==="INSIDER"){
   if(insiderMatch(clue,room))score-=1.8;
   else if(clue)score+=0.8;
  }else{
   const group=allClues.filter(x=>x.player.id!==target.id);
   if(group.length){
    const similarity=group.reduce((n,x)=>n+overlap(clue,x.clue),0)/group.length;
    if(similarity<0.1)score+=1.1;
    else score-=0.25;
   }
  }
  const repeated=allClues.filter(x=>x.clue===clue).length;
  if(clue&&repeated>1)score+=0.6;
  if(target.isAI&&target.aiRole==="SHADOW"&&ownRole==="INSIDER")score+=0.15;
  return {id:target.id,score};
 }).sort((a,b)=>b.score-a.score);
 const tolerance=player.personality==="careful"?0.25:player.personality==="bold"?0.8:0.45;
 const top=scores.filter(x=>x.score>=scores[0].score-tolerance);
 return top[Math.floor(Math.random()*top.length)].id;
}
module.exports={aiClue,aiDiscussion,aiVote};
