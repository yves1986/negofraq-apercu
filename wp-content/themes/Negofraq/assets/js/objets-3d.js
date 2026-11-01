// Objets 3D du bandeau, sculptés par le code pour pouvoir se séparer en morceaux au défilement.
// Chaque fonction renvoie { groupe, pieces } : `pieces` liste ce qui se détache.
import * as THREE from '../vendor/three.module.js';

const { sin, cos, abs, pow, PI, atan2, sqrt } = Math;

function alea(graine) {
	return () => {
		graine = (graine + 0x6d2b79f5) | 0;
		let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function bruit(x, y, z) {
	return sin(x * 1.7 + y * 2.3) * cos(y * 1.3 - z * 2.1) * sin(z * 1.9 + x * 0.7)
		+ 0.5 * sin(x * 3.1 - z * 2.7) * cos(y * 3.7 + x * 2.3);
}

// Bruit ramené entre 0 et 1.
function marbre(x, y, z) {
	return THREE.MathUtils.clamp(0.5 + 0.33 * bruit(x, y, z), 0, 1);
}

// Deux recettes seulement, double face comprise : chaque recette différente coûte
// plusieurs secondes de préparation sur les cartes graphiques modestes.
function matiere(options = {}) {
	return new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.2, side: THREE.DoubleSide, ...options });
}

function uni(couleur, options = {}) {
	return new THREE.MeshPhysicalMaterial({ color: couleur, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide, ...options });
}

function peindre(geometrie, teinte) {
	const position = geometrie.attributes.position;
	const couleurs = new Float32Array(position.count * 3);
	const couleur = new THREE.Color();
	for (let i = 0; i < position.count; i++) {
		teinte(couleur, position.getX(i), position.getY(i), position.getZ(i), i);
		couleur.toArray(couleurs, i * 3);
	}
	geometrie.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
}

// Les deux bords d'une sphère dépliée se rejoignent : même normale pour effacer la couture.
function souderCouture(geometrie, largeur, hauteur) {
	const normales = geometrie.attributes.normal;
	const rangee = largeur + 1;
	for (let j = 0; j <= hauteur; j++) {
		const a = j * rangee, b = a + largeur;
		const n = new THREE.Vector3().fromBufferAttribute(normales, a)
			.add(new THREE.Vector3().fromBufferAttribute(normales, b)).normalize();
		normales.setXYZ(a, n.x, n.y, n.z);
		normales.setXYZ(b, n.x, n.y, n.z);
	}
}

// Coupe une forme autour de l'axe Y en quartiers sans trace visible tant qu'ils sont assemblés.
function decouper(geometrie, quartiers, materiau) {
	const position = geometrie.attributes.position;
	const index = geometrie.index;
	const lots = Array.from({ length: quartiers }, () => []);
	for (let t = 0; t < index.count; t += 3) {
		const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
		const x = position.getX(a) + position.getX(b) + position.getX(c);
		const z = position.getZ(a) + position.getZ(b) + position.getZ(c);
		const secteur = Math.floor(((atan2(z, x) + PI) / (2 * PI)) * quartiers) % quartiers;
		lots[secteur].push(a, b, c);
	}
	return lots.map(lot => {
		const morceau = geometrie.clone();
		morceau.setIndex(lot);
		const boite = new THREE.Box3();
		const point = new THREE.Vector3();
		for (const i of lot) {
			boite.expandByPoint(point.fromBufferAttribute(position, i));
		}
		const centre = boite.getCenter(new THREE.Vector3());
		morceau.translate(-centre.x, -centre.y, -centre.z);
		morceau.computeBoundingBox();
		morceau.computeBoundingSphere();
		const maille = new THREE.Mesh(morceau, materiau);
		maille.position.copy(centre);
		return maille;
	});
}

function feuille(longueur, largeur, palette, courbure = 0.25) {
	const geometrie = new THREE.PlaneGeometry(1, 1, 14, 48);
	const position = geometrie.attributes.position;
	const fond = new THREE.Color(palette.fond), nervure = new THREE.Color(palette.nervure), bord = new THREE.Color(palette.bord);
	const couleurs = new Float32Array(position.count * 3);
	const couleur = new THREE.Color();
	for (let i = 0; i < position.count; i++) {
		const travers = position.getX(i) * 2;
		const v = position.getY(i) + 0.5;
		const profil = pow(sin(PI * pow(v, 0.72)), 0.85);
		position.setXYZ(i,
			travers * profil * largeur / 2,
			v * longueur,
			-abs(travers) * profil * largeur * 0.16 - sin(v * PI * 0.9) * -courbure * longueur * 0.3 - v * v * courbure * longueur * 0.5
				+ sin(v * 15) * 0.012 * abs(travers));
		const laterale = pow(0.5 + 0.5 * sin((v - abs(travers) * 0.3) * 30), 3);
		const milieu = abs(travers) < 0.08 ? 1 : 0;
		couleur.copy(fond).lerp(bord, pow(abs(travers), 1.5) * 0.7 + 0.25 * marbre(v * 3, travers * 2, 1));
		couleur.lerp(nervure, Math.max(milieu, laterale * 0.16));
		couleur.toArray(couleurs, i * 3);
	}
	geometrie.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
	geometrie.computeVertexNormals();
	return geometrie;
}

function poserFeuille(groupe, pieces, geometrie, materiau, x, y, z, rx, ry, rz) {
	const maille = new THREE.Mesh(geometrie, materiau);
	maille.position.set(x, y, z);
	maille.rotation.set(rx, ry, rz);
	groupe.add(maille);
	pieces.push(maille);
	return maille;
}

function tube(points, rayon, materiau, segments = 8) {
	const courbe = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
	return new THREE.Mesh(new THREE.TubeGeometry(courbe, 24, rayon, segments), materiau);
}

function sillons(geometrie, deformer) {
	const position = geometrie.attributes.position;
	const point = new THREE.Vector3();
	for (let i = 0; i < position.count; i++) {
		point.fromBufferAttribute(position, i);
		deformer(point);
		position.setXYZ(i, point.x, point.y, point.z);
	}
}

function coquePod(longueur, rayon, clair, sombre, tache) {
	const geometrie = new THREE.SphereGeometry(1, 72, 56);
	sillons(geometrie, p => {
		const t = (p.y + 1) / 2;
		const angle = atan2(p.z, p.x);
		const cote = abs(cos(angle * 5));
		const epaule = 1 - 0.28 * pow(1 - t, 2.2) - 0.1 * pow(t, 5);
		const relief = 0.84 + 0.2 * pow(cote, 0.7) + 0.012 * bruit(p.x * 4, p.y * 5, p.z * 4);
		const r = rayon * relief * epaule;
		p.set(p.x * r, p.y * longueur - pow(1 - t, 5) * 0.2, p.z * r);
	});
	const base = new THREE.Color(clair), fonce = new THREE.Color(sombre), roux = new THREE.Color(tache);
	peindre(geometrie, (c, x, y, z) => {
		const creux = 1 - pow(abs(cos(atan2(z, x) * 5)), 0.6);
		c.copy(base).lerp(fonce, creux * 0.75 + (0.5 - 0.5 * y / longueur) * 0.2);
		c.lerp(roux, pow(marbre(x * 3, y * 2, z * 3), 2.4) * 0.8);
	});
	geometrie.computeVertexNormals();
	souderCouture(geometrie, 72, 56);
	return geometrie;
}

function cabosse() {
	const groupe = new THREE.Group();
	const pieces = [];
	const peau = matiere({ roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.3 });
	const bois = uni('#4a2a18', { roughness: 0.75 });

	function pod(longueur, rayon, clair, sombre, tache, x, y, z, inclinaison, fentes) {
		const support = new THREE.Group();
		support.position.set(x, y, z);
		support.rotation.z = inclinaison;
		groupe.add(support);
		for (const quartier of decouper(coquePod(longueur, rayon, clair, sombre, tache), fentes, peau)) {
			support.add(quartier);
			pieces.push(quartier);
		}
		return support;
	}

	const jaune = pod(0.62, 0.42, '#e8b52c', '#8a5a14', '#6b3313', 0.38, -0.5, 0.25, 0.02, 4);
	pod(0.78, 0.46, '#6e2c1a', '#2d1009', '#8e4a22', -0.1, 0.72, 0, -0.06, 3);
	pod(0.72, 0.5, '#8a3a1f', '#3b170c', '#a55a2a', 0.86, 0.86, -0.25, 0.42, 3);

	// Fèves cachées dans la cabosse jaune : elles apparaissent quand elle s'ouvre.
	const feve = uni('#e9d6b4', { roughness: 0.4 });
	const tirage = alea(7);
	for (let i = 0; i < 7; i++) {
		const graine = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), feve);
		graine.scale.set(1, 1.5, 0.8);
		graine.position.set((tirage() - 0.5) * 0.3, (i - 3) * 0.13, (tirage() - 0.5) * 0.3);
		graine.rotation.set(tirage() * 3, tirage() * 3, tirage() * 3);
		jaune.add(graine);
		pieces.push(graine);
	}

	const tige = tube([[-1.7, 1.58, -0.2], [-0.6, 1.5, -0.1], [-0.05, 1.5, 0], [0.5, 1.56, -0.1], [1.0, 1.5, -0.2]], 0.045, bois);
	groupe.add(tige);
	pieces.push(tige);
	for (const points of [
		[[-0.1, 1.5, 0], [-0.08, 1.4, 0], [-0.07, 1.3, 0]],
		[[0.82, 1.53, -0.2], [0.8, 1.45, -0.2], [0.6, 1.35, -0.25]],
		[[0.32, 1.52, -0.08], [0.36, 0.9, 0.3], [0.38, 0.5, 0.3], [0.38, 0.12, 0.25]]
	]) {
		const attache = tube(points, 0.035, bois);
		groupe.add(attache);
		pieces.push(attache);
	}

	const vert = { fond: '#2f6b24', nervure: '#7fb04a', bord: '#1f4a1c' };
	const jaunie = { fond: '#e7bb45', nervure: '#a9792a', bord: '#b47a22' };
	const rousse = { fond: '#9a4a2b', nervure: '#d08a5e', bord: '#6a2c1a' };
	const peinte = matiere({ roughness: 0.42, clearcoat: 0.35 });
	poserFeuille(groupe, pieces, feuille(1.7, 0.8, jaunie), peinte, -0.45, 1.5, 0.15, 0.2, 0.2, 2.75);
	poserFeuille(groupe, pieces, feuille(1.45, 0.72, vert), peinte, -0.75, 1.5, 0.3, 0.1, -0.3, 3.3);
	poserFeuille(groupe, pieces, feuille(1.5, 0.72, jaunie, 0.15), peinte, -1.25, 1.55, 0.05, -0.1, 0.3, 2.5);
	poserFeuille(groupe, pieces, feuille(1.65, 0.8, rousse), peinte, 0.92, -0.28, -0.1, 0.3, -0.2, 3.0);
	poserFeuille(groupe, pieces, feuille(1.5, 0.76, vert, 0.15), peinte, 1.1, 1.05, -0.45, -0.2, 0.4, 3.45);

	groupe.position.set(0, -0.15, 0);
	return { groupe, pieces };
}

function moussu(rayon, graine) {
	const support = new THREE.Group();
	const tirage = alea(graine);
	const coeur = new THREE.SphereGeometry(rayon, 40, 28);
	sillons(coeur, p => {
		p.multiplyScalar(1 + 0.16 * bruit(p.x * 3 + graine, p.y * 3, p.z * 3));
		p.y *= 0.62;
	});
	coeur.computeVertexNormals();
	souderCouture(coeur, 40, 28);
	support.add(new THREE.Mesh(coeur, uni('#16381a', { roughness: 0.9, clearcoat: 0.02 })));

	const touffe = new THREE.ConeGeometry(0.026, 0.13, 5);
	const brins = new THREE.InstancedMesh(touffe, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 460);
	const place = new THREE.Object3D();
	const couleur = new THREE.Color();
	const normale = new THREE.Vector3();
	const haut = new THREE.Vector3(0, 1, 0);
	for (let i = 0; i < brins.count; i++) {
		normale.set(tirage() - 0.5, tirage() * 0.8 + 0.05, tirage() - 0.5).normalize();
		place.position.copy(normale).multiplyScalar(rayon * (0.92 + 0.1 * tirage()));
		place.position.y *= 0.62;
		place.quaternion.setFromUnitVectors(haut, normale);
		const taille = 0.7 + tirage() * 1.1;
		place.scale.set(taille, taille * (0.8 + tirage()), taille);
		place.updateMatrix();
		brins.setMatrixAt(i, place.matrix);
		brins.setColorAt(i, couleur.setHSL(0.27 + tirage() * 0.07, 0.62, 0.17 + tirage() * 0.24));
	}
	support.add(brins);
	return support;
}

function rameau(longueur, graine, materiauBois, materiauAiguilles) {
	const support = new THREE.Group();
	const tirage = alea(graine);
	support.add(tube([[0, 0, 0], [longueur * 0.5, longueur * 0.1, 0.02], [longueur, longueur * 0.26, 0]], 0.014, materiauBois, 5));
	const aiguilles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.002, 0.012, 0.3, 4), materiauAiguilles, 34);
	const place = new THREE.Object3D();
	const couleur = new THREE.Color();
	for (let i = 0; i < aiguilles.count; i++) {
		const t = i / aiguilles.count;
		const cote = i % 2 ? 1 : -1;
		place.position.set(longueur * t, longueur * 0.26 * t * t + longueur * 0.1 * t, 0);
		place.rotation.set((tirage() - 0.5) * 1.4, 0, -0.5 + cote * (0.95 + tirage() * 0.3));
		place.translateY(0.15);
		place.scale.setScalar(0.72 + tirage() * 0.55);
		place.updateMatrix();
		aiguilles.setMatrixAt(i, place.matrix);
		aiguilles.setColorAt(i, couleur.setHSL(0.27 + tirage() * 0.05, 0.75, 0.38 + tirage() * 0.18));
	}
	support.add(aiguilles);
	return support;
}

function arbuste() {
	const groupe = new THREE.Group();
	const pieces = [];
	const ecorce = uni('#7a5a3e', { roughness: 0.8 });
	const aiguilles = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#2c6b12', emissiveIntensity: 0.35 });

	const tronc = tube([[0.02, -0.85, 0], [-0.04, -0.3, 0.02], [0.05, 0.25, 0], [-0.02, 1.0, 0.02]], 0.042, ecorce);
	groupe.add(tronc);
	pieces.push(tronc);

	const etages = [
		[-0.35, 0.9, 0.2], [-0.2, 0.82, 3.0], [-0.02, 0.78, 1.4], [0.15, 0.7, 4.4],
		[0.32, 0.6, 0.6], [0.48, 0.52, 2.4], [0.64, 0.44, 5.2], [0.8, 0.34, 3.6], [0.95, 0.26, 1.0]
	];
	etages.forEach(([y, longueur, angle], rang) => {
		const branche = rameau(longueur, 11 + rang, ecorce, aiguilles);
		branche.position.set(0, y, 0);
		branche.rotation.y = angle;
		groupe.add(branche);
		pieces.push(branche);
	});

	for (const [rayon, x, y, z, graine] of [
		[0.72, 0.15, -1.0, 0.1, 3], [0.62, -0.72, -1.1, 0.12, 5], [0.66, 0.92, -1.08, -0.05, 8],
		[0.46, -0.3, -1.12, 0.52, 13], [0.44, 0.52, -1.12, 0.55, 21], [0.42, -1.26, -1.2, -0.05, 34], [0.4, 1.42, -1.2, 0.1, 55]
	]) {
		const motte = moussu(rayon, graine);
		motte.position.set(x, y, z);
		groupe.add(motte);
		pieces.push(motte);
	}

	groupe.position.y = 0.05;
	return { groupe, pieces };
}

function graineBombee(longueur, largeur, materiau) {
	const geometrie = new THREE.SphereGeometry(1, 32, 24);
	sillons(geometrie, p => p.set(p.x * largeur * (1 - 0.2 * p.y), p.y * longueur, p.z * largeur * 0.55));
	geometrie.computeVertexNormals();
	souderCouture(geometrie, 32, 24);
	return new THREE.Mesh(geometrie, materiau);
}

function motteTerre(rayon, graine) {
	const geometrie = new THREE.SphereGeometry(rayon, 56, 40);
	sillons(geometrie, p => {
		p.multiplyScalar(1 + 0.22 * bruit(p.x * 6 + graine, p.y * 6, p.z * 6) + 0.1 * bruit(p.x * 15, p.y * 15 + graine, p.z * 15));
		p.y *= 0.62;
	});
	geometrie.computeVertexNormals();
	souderCouture(geometrie, 56, 40);
	return new THREE.Mesh(geometrie, uni('#241a15', { roughness: 0.95, clearcoat: 0.02 }));
}

function germe() {
	const groupe = new THREE.Group();
	const pieces = [];
	const tige = uni('#6fae2a', { roughness: 0.42, emissive: '#2f5c0a', emissiveIntensity: 0.3 });
	const cotyledon = uni('#5f9a34', { roughness: 0.4, clearcoat: 0.5, emissive: '#1f3d0d', emissiveIntensity: 0.3 });
	const lumiere = matiere({ roughness: 0.46, clearcoat: 0.25, emissive: '#6ea814', emissiveIntensity: 0.32 });
	const eclairee = { fond: '#c5ee3c', nervure: '#eafa8e', bord: '#7fbe22' };

	const grande = tube([[0.38, -1.15, 0], [0.34, -0.5, 0.02], [0.32, 0.1, 0], [0.34, 0.75, 0]], 0.05, tige);
	groupe.add(grande);
	pieces.push(grande);

	for (const [x, sens] of [[0.32, -1], [0.36, 1]]) {
		const petiole = tube([[x, 0.72, 0], [x + sens * 0.14, 0.92, 0], [x + sens * 0.4, 1.12, 0]], 0.022, tige);
		groupe.add(petiole);
		pieces.push(petiole);
	}
	poserFeuille(groupe, pieces, feuille(1.15, 0.85, eclairee, 0.12), lumiere, 0.76, 1.12, 0, 0.5, 0.15, -1.62);
	poserFeuille(groupe, pieces, feuille(1.15, 0.85, eclairee, 0.12), lumiere, -0.06, 1.12, 0, 0.5, -0.15, 1.62);

	for (const [x, z, rotation] of [[0.2, 0.08, 0.14], [0.47, 0.06, -0.14]]) {
		const moitie = graineBombee(0.31, 0.2, cotyledon);
		moitie.position.set(x, 0.32, z);
		moitie.rotation.z = rotation;
		groupe.add(moitie);
		pieces.push(moitie);
	}

	const courbee = tube([[-0.42, -1.15, 0.1], [-0.58, -0.75, 0.1], [-0.82, -0.42, 0.1], [-0.62, -0.2, 0.1]], 0.05, tige);
	groupe.add(courbee);
	pieces.push(courbee);
	const tete = graineBombee(0.26, 0.2, cotyledon);
	tete.position.set(-0.52, -0.2, 0.1);
	tete.rotation.z = 1.05;
	groupe.add(tete);
	pieces.push(tete);
	poserFeuille(groupe, pieces, feuille(0.6, 0.48, eclairee, 0.1), lumiere, -0.32, -0.28, 0.14, 0.3, 0.1, -2.1);

	for (const [rayon, x, y, z, graine] of [
		[0.6, 0.05, -1.32, 0.05, 2], [0.46, -0.72, -1.4, 0.1, 4], [0.46, 0.8, -1.4, 0.05, 6],
		[0.36, -0.25, -1.4, 0.48, 9], [0.36, 0.42, -1.42, 0.5, 12], [0.3, -1.18, -1.48, 0, 15], [0.3, 1.22, -1.48, 0, 18]
	]) {
		const motte = motteTerre(rayon, graine);
		motte.position.set(x, y, z);
		groupe.add(motte);
		pieces.push(motte);
	}

	groupe.position.y = 0.1;
	return { groupe, pieces };
}

function boite(largeur, hauteur, profondeur, materiau, rayon = 0.05) {
	const forme = new THREE.Shape();
	const l = largeur / 2 - rayon, h = hauteur / 2 - rayon;
	forme.moveTo(-l, -h - rayon);
	forme.lineTo(l, -h - rayon);
	forme.quadraticCurveTo(l + rayon, -h - rayon, l + rayon, -h);
	forme.lineTo(l + rayon, h);
	forme.quadraticCurveTo(l + rayon, h + rayon, l, h + rayon);
	forme.lineTo(-l, h + rayon);
	forme.quadraticCurveTo(-l - rayon, h + rayon, -l - rayon, h);
	forme.lineTo(-l - rayon, -h);
	forme.quadraticCurveTo(-l - rayon, -h - rayon, -l, -h - rayon);
	const geometrie = new THREE.ExtrudeGeometry(forme, { depth: profondeur - 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 });
	geometrie.center();
	return new THREE.Mesh(geometrie, materiau);
}

function roue(rayon, largeur, gomme, jante) {
	const support = new THREE.Group();
	const pneu = new THREE.Mesh(new THREE.CylinderGeometry(rayon, rayon, largeur, 40, 1, false), gomme);
	pneu.rotation.z = PI / 2;
	support.add(pneu);
	const centre = new THREE.Mesh(new THREE.CylinderGeometry(rayon * 0.58, rayon * 0.58, largeur + 0.03, 28), jante);
	centre.rotation.z = PI / 2;
	support.add(centre);
	const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(rayon * 0.2, rayon * 0.2, largeur + 0.1, 16), gomme);
	moyeu.rotation.z = PI / 2;
	support.add(moyeu);
	const crampons = new THREE.InstancedMesh(new THREE.BoxGeometry(largeur * 0.46, 0.08, 0.09), gomme, 26);
	const place = new THREE.Object3D();
	for (let i = 0; i < crampons.count; i++) {
		const angle = (i / crampons.count) * 2 * PI;
		place.position.set((i % 2 ? 1 : -1) * largeur * 0.26, cos(angle) * (rayon + 0.015), sin(angle) * (rayon + 0.015));
		place.rotation.x = -angle;
		place.updateMatrix();
		crampons.setMatrixAt(i, place.matrix);
	}
	support.add(crampons);
	return support;
}

function tracteur() {
	const groupe = new THREE.Group();
	const pieces = [];
	const rouge = uni('#c0271f', { roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.08 });
	const blanc = uni('#f1eee6', { roughness: 0.35, clearcoat: 0.7 });
	const noir = uni('#191a1d', { roughness: 0.8, clearcoat: 0.02 });
	const acier = uni('#7d8289', { metalness: 0.7, roughness: 0.35 });
	const creme = uni('#e6d696', { roughness: 0.4, clearcoat: 0.5 });
	const vitre = new THREE.MeshPhysicalMaterial({ color: '#bcd4e6', roughness: 0.08, transmission: 0.75, thickness: 0.1, ior: 1.45, clearcoat: 1 });

	function piece(objet, x, y, z, rx = 0, ry = 0, rz = 0) {
		objet.position.set(x, y, z);
		objet.rotation.set(rx, ry, rz);
		groupe.add(objet);
		pieces.push(objet);
	}

	piece(boite(0.8, 0.34, 2.2, rouge), 0, -0.3, 0.1);
	piece(boite(0.7, 0.58, 1.16, rouge, 0.1), 0, 0.02, 0.72);
	piece(boite(0.72, 0.1, 1.2, blanc), 0, 0.33, 0.72);
	piece(boite(0.5, 0.42, 0.06, noir), 0, -0.02, 1.31);
	piece(tube([[0.2, 0.34, 1.06], [0.2, 0.7, 1.06], [0.2, 0.86, 1.04]], 0.035, noir), 0, 0, 0);

	const bas = -0.72;
	piece(roue(0.66, 0.42, noir, rouge), -0.76, bas + 0.17, -0.45);
	piece(roue(0.66, 0.42, noir, rouge), 0.76, bas + 0.17, -0.45);
	piece(roue(0.38, 0.26, noir, blanc), -0.62, bas - 0.1, 1.02);
	piece(roue(0.38, 0.26, noir, blanc), 0.62, bas - 0.1, 1.02);
	piece(boite(1.0, 0.07, 0.34, acier), 0, bas - 0.1, 1.02);
	piece(boite(1.1, 0.1, 0.34, acier), 0, bas + 0.17, -0.45);
	piece(boite(0.5, 0.42, 0.78, rouge, 0.08), -0.72, 0.02, -0.45);
	piece(boite(0.5, 0.42, 0.78, rouge, 0.08), 0.72, 0.02, -0.45);

	piece(boite(0.98, 0.1, 1.1, noir), 0, 0.02, -0.24);
	for (const [x, z] of [[-0.48, 0.28], [0.48, 0.28], [-0.48, -0.78], [0.48, -0.78]]) {
		piece(new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.88, 12), blanc), x, 0.5, z);
	}
	piece(boite(1.16, 0.14, 1.32, blanc, 0.06), 0, 0.98, -0.25);
	piece(boite(0.96, 0.8, 0.03, vitre, 0.015), 0, 0.5, 0.28, 0.02);
	piece(boite(0.96, 0.8, 0.03, vitre, 0.015), 0, 0.5, -0.78);
	piece(boite(0.03, 0.8, 1.04, vitre, 0.01), -0.48, 0.5, -0.25);
	piece(boite(0.03, 0.8, 1.04, vitre, 0.01), 0.48, 0.5, -0.25);
	piece(boite(0.4, 0.5, 0.1, noir), 0, 0.32, -0.5);
	piece(boite(0.42, 0.1, 0.42, noir), 0, 0.14, -0.32);
	const volant = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 8, 24), noir);
	piece(volant, 0, 0.34, 0.1, 0.9);

	piece(new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.22, 0.72, 40, 1, true), creme), 0, -0.1, -1.42);
	piece(new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.03, 10, 40), creme), 0, 0.26, -1.42, PI / 2);
	piece(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 24), acier), 0, -0.52, -1.42);
	piece(boite(0.1, 0.1, 0.6, acier), 0, -0.56, -1.0);

	groupe.scale.setScalar(1.02);
	const support = new THREE.Group();
	support.add(groupe);
	groupe.rotation.set(0.14, 2.45, 0);
	groupe.position.y = -0.05;
	return { groupe: support, pieces };
}

function poivron() {
	const groupe = new THREE.Group();
	const pieces = [];
	const geometrie = new THREE.SphereGeometry(1, 96, 72);
	sillons(geometrie, p => {
		const t = (p.y + 1) / 2;
		const angle = atan2(p.z, p.x);
		const lobe = 1 + 0.11 * cos(angle * 3 + 0.6) * (0.35 + 0.65 * sin(PI * t));
		const tasse = 1 - 0.34 * pow(1 - t, 2.4);
		const creux = 0.2 * pow(t, 8);
		const base = -0.07 * pow(1 - t, 6) * cos(angle * 3 + 0.6);
		const r = lobe * tasse;
		p.set(p.x * r * 1.02, (p.y * 1.26 - creux + base), p.z * r * 1.02);
	});
	const vif = new THREE.Color('#d3160f'), fonce = new THREE.Color('#7e0806'), orange = new THREE.Color('#f04a18');
	peindre(geometrie, (c, x, y, z) => {
		c.copy(vif).lerp(fonce, pow(1 - (0.5 + 0.5 * cos(atan2(z, x) * 3 + 0.6)), 2) * 0.7);
		c.lerp(orange, pow(marbre(x * 1.5, y * 1.5, z * 1.5), 3) * 0.5);
	});
	geometrie.computeVertexNormals();
	souderCouture(geometrie, 96, 72);
	const peau = matiere({ roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 });
	for (const quartier of decouper(geometrie, 6, peau)) {
		groupe.add(quartier);
		pieces.push(quartier);
	}

	const vert = uni('#2f8a22', { roughness: 0.32, clearcoat: 0.7 });
	const queue = tube([[0, 0.98, 0], [0.03, 1.22, 0.02], [0.2, 1.46, 0.04], [0.48, 1.54, 0.06]], 0.085, vert, 12);
	groupe.add(queue);
	pieces.push(queue);
	const collier = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.34, 0.1, 5), vert);
	collier.position.y = 1.02;
	groupe.add(collier);
	pieces.push(collier);

	// Gouttes en verre autour du poivron, comme la gerbe d'eau de la photo.
	const eau = new THREE.MeshPhysicalMaterial({ color: '#dbeeff', roughness: 0.04, transparent: true, opacity: 0.3, clearcoat: 1, envMapIntensity: 2.4 });
	const tirage = alea(29);
	for (let i = 0; i < 26; i++) {
		const goutte = new THREE.Mesh(new THREE.SphereGeometry(0.035 + tirage() * 0.075, 18, 14), eau);
		const angle = tirage() * 2 * PI;
		const distance = 1.22 + tirage() * 0.62;
		goutte.position.set(cos(angle) * distance, sin(angle) * distance * 0.95, 0.15 + tirage() * 0.75);
		goutte.scale.y = 1 + tirage() * 0.5;
		groupe.add(goutte);
		pieces.push(goutte);
	}

	groupe.scale.setScalar(0.96);
	groupe.position.y = -0.1;
	const support = new THREE.Group();
	support.add(groupe);
	return { groupe: support, pieces };
}

function feveCafe(taille, materiau) {
	const geometrie = new THREE.SphereGeometry(1, 56, 40);
	sillons(geometrie, p => {
		const sillon = Math.exp(-pow((p.x - 0.14 * sin(p.y * 3.2)) / 0.13, 2)) * (1 - pow(p.y, 8));
		const face = p.z > 0 ? p.z * 0.62 - sillon * 0.3 * p.z : p.z * 0.98;
		p.set(p.x * 0.72 * taille, p.y * taille, face * 0.72 * taille);
	});
	const clair = new THREE.Color('#7a4522'), fonce = new THREE.Color('#3a1c0e'), creux = new THREE.Color('#150904');
	peindre(geometrie, (c, x, y, z) => {
		const u = x / (0.72 * taille), v = y / taille;
		const sillon = z > 0 ? Math.exp(-pow((u - 0.14 * sin(v * 3.2)) / 0.13, 2)) : 0;
		c.copy(fonce).lerp(clair, marbre(x * 6 / taille, y * 4 / taille, z * 6 / taille));
		c.lerp(creux, sillon * 0.9);
	});
	geometrie.computeVertexNormals();
	souderCouture(geometrie, 56, 40);
	return new THREE.Mesh(geometrie, materiau);
}

function cafe() {
	const groupe = new THREE.Group();
	const pieces = [];
	const tirage = alea(41);
	const bois = uni('#6f4a2c', { roughness: 0.7 });
	const mure = uni('#b0122c', { roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.1 });
	const foncee = uni('#6d0a24', { roughness: 0.24, clearcoat: 0.9, clearcoatRoughness: 0.1 });
	const vive = uni('#d8352b', { roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.1 });
	const verte = uni('#7c9a36', { roughness: 0.32, clearcoat: 0.6 });
	const feuilleVerte = matiere({ roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
	const grillee = matiere({ roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25 });

	const rameauCafe = tube([[-1.75, 0.62, -0.1], [-0.8, 1.02, 0], [0.2, 1.08, 0.05], [1.05, 0.92, 0], [1.7, 0.62, -0.1]], 0.05, bois);
	groupe.add(rameauCafe);
	pieces.push(rameauCafe);

	// Cerises serrées en grappes le long de la branche.
	const cerise = new THREE.SphereGeometry(1, 28, 20);
	for (const [cx, cy, nombre] of [[-0.95, 0.92, 15], [0.02, 1.02, 18], [0.98, 0.9, 15]]) {
		for (let i = 0; i < nombre; i++) {
			const angle = tirage() * 2 * PI;
			const ecart = sqrt(tirage());
			const rouge = tirage();
			const materiau = rouge > 0.9 ? verte : rouge > 0.6 ? vive : rouge > 0.25 ? mure : foncee;
			const baie = new THREE.Mesh(cerise, materiau);
			const rayon = 0.1 + tirage() * 0.045;
			baie.scale.set(rayon, rayon * 1.08, rayon);
			baie.position.set(cx + cos(angle) * ecart * 0.34, cy + sin(angle) * ecart * 0.24, tirage() * 0.3 - 0.05);
			baie.rotation.set(tirage() * 3, tirage() * 3, 0);
			groupe.add(baie);
			pieces.push(baie);
		}
	}

	const palette = { fond: '#2d6a2c', nervure: '#8dbb55', bord: '#174b20' };
	for (const [x, y, z, rx, ry, rz, longueur, largeur] of [
		[-1.1, 0.95, -0.08, 0.35, 0.2, 0.75, 1.15, 0.56],
		[-0.25, 1.08, -0.15, 0.25, -0.2, 0.28, 0.95, 0.48],
		[0.75, 1.03, -0.15, 0.3, 0.1, -0.3, 1.05, 0.5],
		[1.25, 0.82, -0.05, 0.4, -0.2, -1.0, 1.1, 0.54],
		[-1.2, 0.8, 0.02, 0.1, 0.2, 2.2, 1.0, 0.5],
		[1.3, 0.75, 0.05, 0.1, -0.2, 3.9, 0.95, 0.48]
	]) {
		poserFeuille(groupe, pieces, feuille(longueur, largeur, palette, 0.14), feuilleVerte, x, y, z, rx, ry, rz);
	}

	// Grosses fèves torréfiées sous la branche.
	for (const [taille, x, y, z, rx, ry, rz] of [
		[0.46, 0.0, -0.25, 0.3, 0.2, -0.25, 0.5],
		[0.42, -0.86, -0.42, 0.08, 0.1, 0.5, -0.5],
		[0.42, 0.88, -0.38, 0.05, 0.3, -0.5, 1.1],
		[0.36, -0.42, -1.1, 0.15, 0.3, 2.8, 1.2],
		[0.38, 0.5, -1.15, 0.2, -0.2, 0.3, -0.9],
		[0.26, -1.34, -1.02, 0, 0.2, -0.4, 0.3],
		[0.26, 1.36, -1.05, 0, 0.2, 2.9, -0.5]
	]) {
		const fev = feveCafe(taille, grillee);
		fev.position.set(x, y, z);
		fev.rotation.set(rx, ry, rz);
		groupe.add(fev);
		pieces.push(fev);
	}

	groupe.position.y = 0.1;
	return { groupe, pieces };
}

export default { cabosse, arbuste, germe, tracteur, poivron, cafe };
