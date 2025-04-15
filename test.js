var beginTekst = `
<section>
<h4>Voorstellingen</h4>
        <div>
            <div>
                <div>
                    <div>april 30, 2025</div>
                    <div>18:30</div>
                </div>
                <div>
                    <div>PAARD</div>
                    <div>Den Haag</div>
                </div>
                <div><a>Tickets: baroeg.nl.</a></div>
            </div>
        </div>
        <p>
            <span
                >Terwijl op Rotterdam-Zuid keihard gewerkt wordt aan een nieuw
                onderkomen is Baroeg On Tour. Op diverse locaties in de regio
                programmeren we te gekke shows zoals je van ons gewend bent. Dit
                keer wijken we uit naar de residentie. Naar PAARD om precies te
                zijn.</span
            >
        </p>
        <h3><a> Venom Inc.</a></h3>
        <p>
            <span
                >Van sommige legendarische bands bestaan twee versies. Zo ook
                van Venom. In 2015 richten oerleden Abaddon en Mantas Venom Inc.
                op. Dit doen ze samen met Demolition Man die vanaf het album
                “Prime Evil” uit 1989 op een aantal Venom platen te horen
                is.</span
            ><span> </span
            ><span
                >Anno 2025 is Demolition Man als enige nog over. Abaddon is al
                sinds 2018 buiten beeld en Mantas kampt met zijn gezondheid. En
                toch staat er nog steeds een band om u tegen te zeggen. Met oog
                voor de Venom classics en het eigen Venom Inc. materiaal word je
                op je wenken bediend.</span
            >
        </p>

        <h3><a> Krisiun</a></h3>
        <p>
            <span
                >Al sinds 1990 bestaat Krisiun uit drie broers. Hoewel
                broederliefde niet in elke familie vanzelfsprekend is, kunnen we
                bij deze Brazilianen van een stevige bloedband spreken. En dat
                wijst zich uit in een discografie waar je u tegen zegt en een
                onbedwingbare drang tot toeren. En juist dat maakt Krisiun een
                goed geoliede death metalmachine. Nooit stellen ze teleur met
                hun beenharde materiaal.</span
            >
        </p>
        <h3><a> Hate</a></h3>
        <p>
            De Polen van Hate kennen ook een gezonde werkethiek. Om de twee jaar
            een nieuw album uitpoepen en de rest van de tijd de podia langs om
            live te spelen. Ook bij Hate weet je dus dat hun technische
            death/black met overtuiging gebracht wordt.
        </p>
        <h3><a> Ater</a></h3>
        <p>
            Het Chileense Ater timmert aardig aan de weg in Europa. Vorig jaar
            was deze band nog op pad met Batushka. In maart van dit jaar met
            Leaves’ Eyes en nu dus met deze package. Ater combineert death en
            black metal met een progressieve inslag.
        </p>
        <p>
            Kortom, met deze vier weergaloze bands op de bill zien we jou graag
            in Den Haag.
        </p>
        <p>Locatie: PAARD Prinsegracht 12 2512 GA Den Haag</p>
        <p>
            Het tijdschema: 19:00 – 19:30 – Ater 19:45 – 20:25 – Hate 20:40 –
            21:30 – Krisiun 22:00 – 23:20 – Venom Inc.
        </p>
        <p>
            <i
                >️Het is inmiddels geen nieuws meer dat het huidige pand Baroeg
                is gesloopt en wordt herbouwd. Lees meer over de nieuwbouw op:
                <a>https://baroeg.nl/nieuwbouw</a>.</i
            >
        </p>
        <p>
            In de tussentijd gaat Baroeg op tour: ➡ Bekijk onze komende
            concerten hier: <a>www.baroeg.nl/agenda</a> ➡ Koop je ticket(s)
            hier: <a>www.baroeg.nl/tickets</a> ➡ Meer info over de Baroeg On
            Tour locaties vind je hier: <a>https://baroeg.nl/baroeg-on-tour</a>
        </p>
        <div>
            <a
                ><span><i></i> Locatie: PAARD </span></a
            >
        </div>
        <div>
            <a
                ><span><i></i> Facebook Event</span></a
            >
        </div>
        <div>
            <a
                ><span><i></i> Flyer </span></a
            >
        </div>
        <div>
            <a
                ><span><i></i> Tickets</span></a
            >
        </div>

        <p>
            Heb je zin in een concert? Weet dan waar je je tickets koopt! Het
            platform Weet Waar Je Koopt zet zich in voor aandacht en
            bewustwording van secondary ticketing. Kijk op
            <a>www.weetwaarjekoopt.nl</a>&nbsp;voor alle officiële
            verkoopkanalen van onze kaarten naast onze eigen website natuurlijk!
            Mocht je toch een poging willen doen om tickets te bemachtigen voor
            een uitverkochte show, dan verwijzen we je door naar Ticketswap en
            niet naar mensen die tickets te koop aanbieden in het event. Dit
            zijn namelijk vaak fake tickets.
        </p>
    </section>`;

/**
 * Helpt bij het vinden van DIVS en dergelijke om ze netjes op te ruimen!
 * @param {} tekst
 * @param {*} element
 */
function vindIndices(tekst, element) {
    var indices1 = [];
    var indices2 = [];
    var sluitIndices = [];
    var indicesTotaal = [];
    var tagName1 = `<${element}`;
    var tagName2 = `</${element}`;
    var tagEnd = `>`;
    for (var i = 0; i < tekst.length - (element.length + 3); i++) {
        const str1 = `${tekst[i]}${tekst[i + 1]}${tekst[i + 2]}${tekst[i + 3]}`;
        const str2 = `${str1}${tekst[i + 4]}`;
        const str3 = `${tekst[i + 6]}`;
        if (str1 === tagName1) indices1.push(i);
        if (str2 === tagName2) indices2.push(i);
        if (str1 === tagName1 || str2 === tagName2) indicesTotaal.push(i);
        if (str3 === tagEnd) sluitIndices.push(i + 6);
    }
    console.log(indices1);
    console.log(indices2);
    console.log(indicesTotaal);
    console.log(sluitIndices);
}

vindIndices(beginTekst, "div");
