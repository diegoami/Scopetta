# Scopa a due — le regole come le gioca questo gioco

Di scopa si gioca in tanti modi quante sono le case. Questa è la versione che il
gioco distribuisce, detta per intero, così si può capire se è la scopa che si
conosce. La versione inglese è `RULES.md`.

La schermata delle regole dentro al gioco porta le stesse regole nelle due
lingue, in breve: quel che sta in uno schermo che si legge sul telefono a metà
smazzata. Questo file è la forma lunga, e i due non sono indipendenti — una
regola scritta due volte in due posti prende strade diverse — quindi dove si
sovrappongono qui si cita la schermata invece di riscriverla, e
`node tools/check_ui.mjs` verifica che ciascuna metà di quella schermata sia
ancora le regole e non un riassunto.

Ogni regola che cambia da casa a casa è una **costante con un nome** in
`public/engine.js`, e questo file la nomina, così cambiarla è una riga e non uno
scavo.

## Il mazzo

Quaranta carte italiane in quattro semi — **denari, coppe, spade, bastoni** —
numerate da 1 a 10. Non ci sono 8, 9 e 10 come tali: le figure sono il
**fante** (8), il **cavallo** (9) e il **re** (10).

Una carta ha due valori, e non sono lo stesso numero:

| carta | prende come | primiera |
|---|---|---|
| sette | 7 | **21** |
| sei | 6 | 18 |
| asso | 1 | 16 |
| cinque | 5 | 15 |
| quattro | 4 | 14 |
| tre | 3 | 13 |
| due | 2 | 12 |
| fante, cavallo, re | 8, 9, 10 | 10 |

Il **sette di denari** è il *settebello*.

## La distribuzione

> Il mazziere dà **tre carte a testa e quattro scoperte sul tavolo**. Quando
> entrambi restano senza carte ne dà altre tre per uno, e nient'altro al
> tavolo: sei giri, trentasei carte giocate. Se fra le quattro del tavolo ci
> sono tre o quattro re si rifà la smazzata.

Il rifacimento è `REDEAL_RE = 3`, e la ragione vale la pena dirla: con tre re in
tavola e uno ancora nel mazzo al massimo uno di loro può essere accoppiato,
quindi nessuna presa potrebbe svuotare il tavolo e per tutta la smazzata nessuna
scopa sarebbe possibile.

Il mazziere si alterna. A freddo dà l'avversario, perché chi non dà gioca per
primo e la prima smazzata la apri tu — lo stesso verso di Discola e di
Tressette. **Il mazziere gioca per ultimo** in ogni giro e quindi gioca
l'ultima carta della smazzata, ed è per questo che la targhetta dice chi ha
dato.

Una mano è **ordinata quando viene data** — per seme nell'ordine in cui stanno
nei fogli delle figure, e dentro il seme dalla carta più alta in giù — e tiene i
suoi buchi fino al giro dopo. Una carta che si sposta sotto il pollice fra
un'occhiata e l'altra è una carta giocata per sbaglio.

## Una giocata

> Si gioca una carta per volta. Se sul tavolo c'è una carta **dello stesso
> valore** si prende quella, e solo quella — anche se una somma sarebbe
> possibile. Altrimenti, se un gruppo di carte **somma al valore** della carta
> giocata, si prende quel gruppo. Se non si prende nulla la carta resta sul
> tavolo. Prendere è obbligatorio: una carta che può prendere prende. Si può
> sempre scegliere di giocare un'altra carta che non prende niente.

Le due costanti sono `SINGLE_BEFORE_SUM = true` e `PRESA_OBBLIGATORIA = true`.
Un sette giocato su un tavolo di 7, 4 e 3 prende il sette; la somma non viene
nemmeno offerta.

La regola lascia una **scelta** in due forme, e il tavolo la passa al giocatore
invece di decidere per lui: due carte dello stesso valore in tavola e una di
quel valore in mano, oppure due gruppi diversi che sommano. La carta si alza, le
carte che prenderebbe si segnano in ottone, la riga sopra la mano dice che cosa
farà il prossimo tocco, e un tocco su una carta del tavolo passa a una presa che
la contiene.

**Tredici è il massimo che il tavolo può tenere**, ed è raggiungibile: le quattro
carte scoperte possono essere quattro cavalli, e poi si possono calare 10, 8, 7,
6, 5, 4, 3, 2 e 1 una dopo l'altra senza che nessuna pareggi un valore o faccia
una somma. Su 10.000 smazzate giocate a caso il test del motore ne ha viste
dodici.

## La scopa

> Una presa che **svuota il tavolo** è una **scopa** e vale un punto, tranne
> quando è fatta con l'ultima carta della smazzata. Dopo la trentaseiesima
> carta quel che resta sul tavolo va a chi ha preso per ultimo, e non è una
> scopa.

`SCOPA_ULTIMA = false` è la prima metà. La seconda non è una costante ma una
regola dentro `gioca`: quel che resta va a `ultimaPresa`, chi ha preso per
ultimo, e non è una scopa per nessuno.

La carta che ha fatto la scopa resta scoperta sul bordo del mazzetto, come vuole
la tradizione, così il conto è pubblico per tutta la smazzata.

## Il punteggio

> Alla fine si contano cinque cose: **carte** (più di venti), **denari** (più
> di cinque), il **settebello** (il sette di denari), la **primiera**, e **una
> scopa un punto**. Un pareggio su carte, denari o primiera non dà il punto a
> nessuno.

La **primiera** è quella che va scritta per esteso:

> La primiera è la somma della carta migliore di ogni seme, con questi valori:
> sette 21, sei 18, asso 16, cinque 15, quattro 14, tre 13, due 12, figure 10.
> Chi non ha carte di un seme non può prendere il punto.

Se nessuno dei due ha tutti e quattro i semi il punto non va a nessuno. Il
riquadro finale mostra le due somme invece di un segno di spunta, e disegna un
trattino dove manca un seme, perché un punto deciso da un conto che non si vede
è quello che più vale la pena mostrare.

Quattro punti più le scope sono tutto il punteggio. Una smazzata senza scope sta
fra 0–4 e 4–0, e **2–2 è comune**: qui il pareggio è un risultato ordinario come
non lo è a tressette, dove undici punti non si dividono.

## La partita

Una *partita* è **una smazzata**, come in Discola e in Tressette. Vince il
totale più alto; a pari totale è patta, e viene registrata come tale. Dà le
carte chi non le ha date questa volta.

## Quel che non si gioca

> Non si giocano le varianti: niente **napola**, niente **asso piglia tutto**,
> niente **re bello**, niente **scopa d'assi**, niente scopa a quindici.

Le prime tre sono costanti lette da un ramo vero — `NAPOLA`,
`ASSO_PIGLIA_TUTTO`, `RE_BELLO` — tutte e tre spente, e ognuna con un test che
la accende e guarda il ramo scattare, perché una costante che nessuno consulta
non renderebbe il cambiamento una riga, sembrerebbe soltanto di sì.

La *scopa d'assi* non ha una costante, di proposito. Le case non sono d'accordo
su che cosa voglia dire — per alcune è un altro nome per l'*asso piglia tutto*,
per altre una scopa contata per un asso giocato su un tavolo vuoto — e una
costante che tira a indovinare fra due regole sarebbe peggio di niente. È la
decisione 8 del §0 di `PLAN.md`, ed è aperta.

Non sono costruiti nemmeno lo scopone e la partita agli 11 punti su più
smazzate. Il §5 di `PLAN.md` dice perché ciascuno è fuori.

## Al tavolo

> Al tavolo: **un tocco gioca la carta**. Se la regola lascia una scelta di
> presa, il primo tocco alza la carta e segna in ottone le carte che
> prenderebbe; un tocco su una carta del tavolo cambia la presa proposta, e il
> secondo tocco sulla carta alzata la gioca. Con la tastiera: **1**–**3**
> scelgono la carta, **spazio** cambia la presa, **Invio** gioca e **Esc**
> rimette giù.

Esc esce anche da un foglio e risponde alla richiesta di conferma. Lo storico
delle smazzate resta in questo browser, su questo dispositivo, e non esce di lì.

## Da dove vengono le carte

> Le figure sono le immagini originali del **Discola** del 1997, in cinque
> mazzi: Trevisane, Piacentine, Napoletane, Romagnole e Francesi. Sono copiate
> carta per carta, senza ridisegnarle. L'avversario invece è di questo gioco:
> una scopa del 1997 da cui copiarlo non c'era, e i suoi pesi si vedono nelle
> impostazioni.
