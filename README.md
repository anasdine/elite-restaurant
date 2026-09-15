# Restaurant Élite — site vitrine

Site statique du **Restaurant Élite**, restaurant turc au 119 route de Colmar, 68040 Ingersheim (aux portes de Colmar).

## Contenu du dépôt

| Chemin | Rôle |
| --- | --- |
| `index.html` | La page du site (design, contenu, SEO, données structurées schema.org) |
| `support.js` | Runtime qui assemble et affiche la page |
| `vendor/` | React, ReactDOM et Babel servis depuis le dépôt — aucune dépendance à un CDN externe |
| `photos/` | Photos du restaurant et de la carte |
| `logo-elite.svg` | Logo |
| `source/` | Fichiers de conception d'origine (archive de travail, non publiés) |
| `.github/workflows/deploy-pages.yml` | Publication automatique sur GitHub Pages |

## Publication

Chaque `push` sur la branche de travail republie le site automatiquement via GitHub Pages.
Aucune étape manuelle, aucun outil à installer.

## Développement local

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Le site en bref

- Une seule page, navigation instantanée entre Accueil / Carte / Le restaurant / Colmar / Contact
- Responsive : menu déroulant et mise en page adaptée sur mobile
- Multilingue (FR, TR, EN, DE, ES, IT, ZH, JA)
- Appel direct et WhatsApp en un clic
- SEO local : métadonnées, Open Graph et fiche `Restaurant` schema.org (adresse, horaires, téléphone, SIRET)

## Informations

- **Adresse** — 119 route de Colmar, 68040 Ingersheim
- **Téléphone** — 09 52 87 54 93
- **Horaires** — du mardi au dimanche, 11h30–14h30 et 18h00–23h00
