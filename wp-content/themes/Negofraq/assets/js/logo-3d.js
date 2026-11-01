// Emblème NEGOFRAQ en verre 3D dans le bandeau des pages intérieures.
// Verre et studio repris du gabarit « Premium 3D Glass » (Three.js r160, licence MIT).
import * as THREE from '../vendor/three.module.js';
import CONTOURS from './logo-3d-contours.js';

const ETENDUE = 3.2;   // taille de l'emblème, en unités monde
const COULEURS = { navy: '#8aa0c6', gold: '#f0d38c' };
const ATTENUATION = { navy: '#2a4274', gold: '#d9b45f' };
const EPAISSEUR = { navy: 0.30, gold: 0.42 };
const DISLOCATION = { defilement: 520, ecart: 2.4 };   // pixels de défilement, écart en unités monde

function pointDansContour(point, contour) {
	let dedans = false;
	for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
		const a = contour[i], b = contour[j];
		if ((a.y > point.y) !== (b.y > point.y)
			&& point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
			dedans = !dedans;
		}
	}
	return dedans;
}

// Du plus grand au plus petit : un contour posé dans une forme en est un trou.
function formesDepuisContours(contours) {
	const echelle = ETENDUE / CONTOURS.taille;
	const moitie = CONTOURS.taille / 2;
	const formes = [];
	for (const contour of contours) {
		const points = contour.map(([x, y]) => new THREE.Vector2((x - moitie) * echelle, (moitie - y) * echelle));
		const parent = formes.find(forme => pointDansContour(points[0], forme.points));
		if (parent) {
			parent.shape.holes.push(new THREE.Path(points));
		} else {
			formes.push({ points, shape: new THREE.Shape(points) });
		}
	}
	return formes.map(forme => forme.shape);
}

function creerVerre(teinte) {
	const verre = new THREE.MeshPhysicalMaterial({
		color: COULEURS[teinte],
		metalness: 0,
		roughness: 0.04,
		transmission: 1,
		thickness: 0.48,
		ior: 1.46,
		attenuationColor: new THREE.Color(ATTENUATION[teinte]),
		attenuationDistance: 0.9,
		clearcoat: 0.8,
		clearcoatRoughness: 0.02,
		iridescence: 0.3,
		iridescenceIOR: 1.3,
		iridescenceThicknessRange: [100, 420],
		envMapIntensity: 1.25
	});
	// r160 n'a pas de dispersion : trois réfractions, plus écartées aux angles rasants.
	verre.onBeforeCompile = shader => {
		shader.uniforms.uChromaticSpread = { value: 0.018 };
		shader.fragmentShader = 'uniform float uChromaticSpread;\n' + shader.fragmentShader;
		const transmission = THREE.ShaderChunk.transmission_fragment.replace(
			/vec4 transmitted = getIBLVolumeRefraction\([\s\S]*?\);/,
			`float chromaticSpread = uChromaticSpread * mix(0.35, 1.0,
				smoothstep(0.15, 0.85, 1.0 - abs(dot(n, v))));
			vec4 transmitted = getIBLVolumeRefraction(
				n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
				pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness,
				material.attenuationColor, material.attenuationDistance );
			vec4 transmittedRed = getIBLVolumeRefraction(
				n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
				pos, modelMatrix, viewMatrix, projectionMatrix, material.ior - chromaticSpread, material.thickness,
				material.attenuationColor, material.attenuationDistance );
			vec4 transmittedBlue = getIBLVolumeRefraction(
				n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
				pos, modelMatrix, viewMatrix, projectionMatrix, material.ior + chromaticSpread, material.thickness,
				material.attenuationColor, material.attenuationDistance );
			transmitted = vec4(transmittedRed.r, transmitted.g, transmittedBlue.b,
				(transmittedRed.a + transmitted.a + transmittedBlue.a) / 3.0);`
		);
		shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', transmission);
	};
	verre.customProgramCacheKey = () => 'negofraq-verre-dispersion-v1';
	return verre;
}

function creerStudio(renderer, scene) {
	const studio = new THREE.Scene();
	studio.background = new THREE.Color('#0b1120');
	for (const [w, h, x, y, z, couleur, puissance] of [
		[2.8, 8, -4, 2, 3, '#ffffff', 2.6], [0.65, 7, 3, 1, 2, '#dceeff', 4.0],
		[5, 0.7, 0, 5, -1, '#ffffff', 3.5], [0.5, 6, -2, 0, -4, '#f0d38c', 3.0],
		[1.0, 5, 3, -1, -3, '#ffe6b0', 2.4], [4, 0.35, 0, -3, 3, '#92bbff', 3.0],
		[0.16, 5, -3, 0, 2, '#ffffff', 5.0], [0.35, 4, 4, 0, -2, '#ffb36b', 2.0]
	]) {
		const panneau = new THREE.Mesh(
			new THREE.PlaneGeometry(w, h),
			new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(puissance), side: THREE.DoubleSide })
		);
		panneau.position.set(x, y, z);
		panneau.lookAt(0, 0, 0);
		studio.add(panneau);
	}
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(studio, 0.025, 0.1, 100).texture;
	pmrem.dispose();
}

// Le verre a besoin d'un décor à réfracter, mais le canevas reste transparent pour laisser
// voir la page : ce fond n'est dessiné que dans la passe de transmission.
function creerFondRefracte(scene) {
	const toile = document.createElement('canvas');
	toile.width = toile.height = 512;
	const pinceau = toile.getContext('2d');
	pinceau.fillStyle = '#c9d6ee';
	pinceau.fillRect(0, 0, 512, 512);
	for (const [x, y, r, couleur] of [
		[150, 170, 300, 'rgba(255,255,255,.95)'],
		[390, 330, 280, 'rgba(240,211,140,.85)'],
		[280, 470, 240, 'rgba(120,160,235,.8)']
	]) {
		const halo = pinceau.createRadialGradient(x, y, 0, x, y, r);
		halo.addColorStop(0, couleur);
		halo.addColorStop(1, 'rgba(255,255,255,0)');
		pinceau.fillStyle = halo;
		pinceau.fillRect(0, 0, 512, 512);
	}
	const texture = new THREE.CanvasTexture(toile);
	texture.colorSpace = THREE.SRGBColorSpace;
	const materiau = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
	const fond = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), materiau);
	fond.position.z = -3;
	fond.onBeforeRender = rendu => {
		const passeTransmission = null !== rendu.getRenderTarget();
		materiau.colorWrite = passeTransmission;
		materiau.depthWrite = passeTransmission;
	};
	scene.add(fond);
}

function creerLogo() {
	const embleme = new THREE.Group();
	for (const teinte of ['navy', 'gold']) {
		const verre = creerVerre(teinte);
		const profondeur = EPAISSEUR[teinte];
		for (const shape of formesDepuisContours(CONTOURS[teinte])) {
			const geometrie = new THREE.ExtrudeGeometry(shape, {
				depth: profondeur, steps: 1, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.03, bevelSegments: 4
			});
			geometrie.translate(0, 0, -profondeur / 2);
			// Chaque éclat pivote autour de son propre centre.
			geometrie.computeBoundingBox();
			const centre = geometrie.boundingBox.getCenter(new THREE.Vector3());
			geometrie.translate(-centre.x, -centre.y, -centre.z);
			const eclat = new THREE.Mesh(geometrie, verre);
			eclat.position.copy(centre);
			embleme.add(eclat);
		}
	}
	return { groupe: embleme, pieces: embleme.children };
}

// Pour chaque pièce : où elle part, comment elle tourne, et à quel moment elle se détache.
function preparerDislocation(groupe, pieces) {
	groupe.updateMatrixWorld(true);
	const generateur = new THREE.Vector3();
	return pieces.map((piece, rang) => {
		const hasard = n => Math.abs(Math.sin((rang + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1;
		const centre = new THREE.Box3().setFromObject(piece).getCenter(new THREE.Vector3());
		const direction = centre.clone().add(generateur.set(hasard(1) - 0.5, hasard(2) - 0.5, (hasard(3) - 0.5) * 1.6));
		direction.normalize().multiplyScalar(DISLOCATION.ecart * (0.7 + 0.6 * hasard(4)));
		const depart = piece.parent.worldToLocal(centre.clone());
		const arrivee = piece.parent.worldToLocal(centre.clone().add(direction));
		return {
			piece,
			position: piece.position.clone(),
			orientation: piece.quaternion.clone(),
			trajet: arrivee.sub(depart),
			axe: new THREE.Vector3(hasard(5) - 0.5, hasard(6) - 0.5, hasard(7) - 0.5).normalize(),
			angle: (hasard(8) - 0.5) * 5,
			retard: hasard(9) * 0.22
		};
	});
}

function disloquer(eclats, avancee) {
	const rotation = new THREE.Quaternion();
	for (const { piece, position, orientation, trajet, axe, angle, retard } of eclats) {
		const propre = THREE.MathUtils.clamp((avancee - retard) / (1 - retard), 0, 1);
		const adoucie = propre * propre * (3 - 2 * propre);
		piece.position.copy(position).addScaledVector(trajet, adoucie);
		piece.quaternion.copy(orientation).multiply(rotation.setFromAxisAngle(axe, angle * adoucie));
	}
}

async function demarrer(conteneur) {
	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
	renderer.setClearColor(0x000000, 0);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.35;
	conteneur.append(renderer.domElement);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
	// Le canevas fait 1,6 fois le cadre : les éclats ont la place de s'écarter sans être coupés.
	camera.position.z = 7.2 * 1.6;

	creerStudio(renderer, scene);
	creerFondRefracte(scene);
	scene.add(new THREE.AmbientLight('#ffffff', 0.35));
	const principale = new THREE.SpotLight('#ffffff', 22);
	principale.position.set(4, 6, 5);
	scene.add(principale);
	const contre = new THREE.DirectionalLight('#ffe9c4', 6);
	contre.position.set(-5, 3, -4);
	scene.add(contre);

	const nom = conteneur.dataset.objet || 'logo';
	// Même numéro de version que ce fichier, pour que les navigateurs ne gardent pas un ancien module.
	const objets = () => import('./objets-3d.js' + new URL(import.meta.url).search);
	const { groupe, pieces } = 'logo' === nom ? creerLogo() : (await objets()).default[nom]();
	scene.add(groupe);
	const eclats = preparerDislocation(groupe, pieces);
	// Préparation en arrière-plan : la page reste fluide pendant que la carte graphique compile.
	await renderer.compileAsync(scene, camera);

	function ajuster() {
		const { width, height } = conteneur.getBoundingClientRect();
		if (!width || !height) {
			return;
		}
		renderer.setSize(width * 1.6, height * 1.6, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.render(scene, camera);
	}
	new ResizeObserver(ajuster).observe(conteneur);

	const pointeur = { x: 0, y: 0 };
	window.addEventListener('pointermove', evenement => {
		pointeur.x = evenement.clientX / window.innerWidth - 0.5;
		pointeur.y = evenement.clientY / window.innerHeight - 0.5;
	}, { passive: true });

	function poser(temps) {
		const entree = Math.min(temps / 1.4, 1);
		const adoucie = 1 - Math.pow(1 - entree, 3);
		groupe.scale.setScalar(0.82 + 0.18 * adoucie);
		groupe.rotation.y = Math.sin(temps * 0.5) * 0.3 + pointeur.x * 0.5 - (1 - adoucie) * 1.1;
		groupe.rotation.x = Math.sin(temps * 0.37) * 0.1 + pointeur.y * 0.3;
		groupe.position.y = Math.sin(temps * 0.8) * 0.05;
	}

	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		groupe.rotation.set(-0.08, 0.3, 0);
		ajuster();
		return;
	}

	const toile = renderer.domElement;
	let avancee = Math.min(window.scrollY / DISLOCATION.defilement, 1);
	let debut = null;
	let images = 0;
	let reference = 0;
	function animer(maintenant) {
		requestAnimationFrame(animer);
		debut ??= maintenant;
		// Machine modeste : moins de 25 images par seconde, on allège le rendu une fois pour toutes.
		if (document.visibilityState === 'visible' && 0 === ++images % 40) {
			if (reference && (maintenant - reference) / 40 > 40 && renderer.getPixelRatio() > 1) {
				renderer.setPixelRatio(1);
				ajuster();
			}
			reference = maintenant;
		}
		const cible = Math.min(window.scrollY / DISLOCATION.defilement, 1);
		avancee += (cible - avancee) * 0.14;
		if (1 - avancee < 0.002) {
			avancee = 1;
		}
		toile.style.opacity = 1 - THREE.MathUtils.smoothstep(avancee, 0.62, 1);
		toile.style.visibility = 1 === avancee ? 'hidden' : 'visible';
		if (1 === avancee) {
			return;
		}
		poser((maintenant - debut) / 1000);
		disloquer(eclats, avancee);
		renderer.render(scene, camera);
	}
	ajuster();
	requestAnimationFrame(animer);
}

const conteneur = document.querySelector('.logo-3d');
if (conteneur) {
	// Décor uniquement : sans WebGL, le bandeau reste complet sans l'objet 3D.
	demarrer(conteneur).catch(() => conteneur.remove());
}
