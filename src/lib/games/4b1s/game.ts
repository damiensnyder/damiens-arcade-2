import { Application, type Container } from 'pixi.js';
import { VIRTUAL_W, COLOR_BACKGROUND } from './config.js';

interface Scene extends Container {
	cleanup?(): void;
}

export class Game {
	app!: Application;
	private currentScene: Scene | null = null;

	async init(): Promise<void> {
		this.app = new Application();
		await this.app.init({
			background: COLOR_BACKGROUND,
			width: VIRTUAL_W,
			height: (VIRTUAL_W * 9) / 16,
			antialias: true,
		});
	}

	resize(w: number, h: number): void {
		this.app.renderer.resize(w, h);
		this.app.stage.scale.set(w / VIRTUAL_W);
	}

	setScene(scene: Scene | null): void {
		if (this.currentScene) {
			this.app.stage.removeChild(this.currentScene);
			this.currentScene.cleanup?.();
		}
		this.currentScene = scene;
		if (scene) this.app.stage.addChild(scene);
	}

	destroy(): void {
		this.currentScene?.cleanup?.();
		this.app.destroy(true);
	}
}
