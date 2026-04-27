import * as THREE from 'three';

export class CameraControls {
    private readonly camera: THREE.PerspectiveCamera;
    private readonly cameraAnchor: THREE.Object3D;
    private readonly domElement: HTMLElement;

    private readonly keys = new Set<string>();
    private isMouseDown = false;
    private isRightMouseDown = false;
    private readonly mouseDownPosition = new THREE.Vector2();
    private readonly movementSpeed = 5.0;
    private readonly lookSpeed = 0.002;
    private readonly zoomSpeed = 0.5;
    private readonly panSpeed = 0.005;

    private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
    private focusTarget: THREE.Object3D | null = null;
    private isEasingLookAt = false;
    private targetSideOffset = 0;
    private currentSideOffset = 0;
    private readonly up = new THREE.Vector3(0, 1, 0);

    private isPointerLocked = false;
    private onChange: (() => void) | null = null;
    private lastReportedPosition = new THREE.Vector3();
    private lastReportedQuaternion = new THREE.Quaternion();

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, cameraAnchor: THREE.Object3D) {
        this.camera = camera;
        this.cameraAnchor = cameraAnchor;
        this.domElement = domElement;

        this.euler.setFromQuaternion(camera.quaternion);
        this.lastReportedPosition.copy(camera.position);
        this.lastReportedQuaternion.copy(camera.quaternion);

        this.addEventListeners();
    }

    private readonly onPointerLockChange = (): void => {
        this.isPointerLocked = document.pointerLockElement === this.domElement;
    };

    private addEventListeners(): void {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        this.domElement.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('wheel', this.onWheel, { passive: false });
        // Prevent context menu to allow for right-click panning
        this.domElement.addEventListener('contextmenu', this.onContextMenu);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
    }

    private readonly onContextMenu = (e: MouseEvent): void => e.preventDefault();

    public dispose(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('wheel', this.onWheel);
        this.domElement.removeEventListener('contextmenu', this.onContextMenu);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    }

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        this.keys.add(event.code);
        
        // Break focus lock if starting manual movement
        if (event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyA' || event.code === 'KeyD') {
            this.focusTarget = null;
            this.isEasingLookAt = false;
        }
    };

    private readonly onKeyUp = (event: KeyboardEvent): void => {
        this.keys.delete(event.code);
    };

    private readonly onMouseDown = (event: MouseEvent): void => {
        if (event.button === 0) { // Left mouse button
            this.isMouseDown = true;
            this.mouseDownPosition.set(event.clientX, event.clientY);
            // No pointer lock on single click/mousedown yet, wait to see if we're rotating
        } else if (event.button === 2) { // Right mouse button
            this.isRightMouseDown = true;
            // Panning: request pointer lock and stop focus lock
            this.focusTarget = null;
            this.isEasingLookAt = false;
            this.domElement.requestPointerLock?.();
        }
    };

    private readonly onMouseUp = (event: MouseEvent): void => {
        if (event.button === 0) {
            this.isMouseDown = false;
        } else if (event.button === 2) {
            this.isRightMouseDown = false;
        }

        if (!this.isMouseDown && !this.isRightMouseDown) {
            if (document.pointerLockElement === this.domElement) {
                document.exitPointerLock?.();
            }
        }
    };

    private readonly onWheel = (event: WheelEvent): void => {
        event.preventDefault();

        const direction = new THREE.Vector3(0, 0, event.deltaY > 0 ? 1 : -1);
        
        if (this.isAnchored()) {
            // When anchored, zoom should be relative to camera's orientation in LOCAL space.
            direction.applyQuaternion(this.camera.quaternion);
        } else {
            // Zoom should be relative to camera's orientation in WORLD space.
            const worldQuat = new THREE.Quaternion();
            this.camera.getWorldQuaternion(worldQuat);
            direction.applyQuaternion(worldQuat);
        }
        
        this.camera.position.addScaledVector(direction, this.zoomSpeed / 5);
    };

    private readonly onMouseMove = (event: MouseEvent): void => {
        const { movementX, movementY } = event;

        // If LMB is down but not locked, and we moved, request lock for mouse-look
        if (this.isMouseDown && document.pointerLockElement !== this.domElement) {
            const dx = event.clientX - this.mouseDownPosition.x;
            const dy = event.clientY - this.mouseDownPosition.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) { // Use same threshold as compositor
                // Break focus lock if starting manual rotation
                this.focusTarget = null;
                this.isEasingLookAt = false;
                this.domElement.requestPointerLock?.();
            }
        }

        if (document.pointerLockElement !== this.domElement) return;

        if (movementX === 0 && movementY === 0) return;

        this.isEasingLookAt = false;

        if (this.isMouseDown) {
            // X-axis (looking left/right)
            this.euler.y -= movementX * this.lookSpeed;

            // Y-axis (looking up/down)
            this.euler.x -= movementY * this.lookSpeed;

            const PI_2 = Math.PI / 2;
            this.euler.x = Math.max(-PI_2, Math.min(PI_2, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        } else if (this.isRightMouseDown) {
            // Pan movement
            const panX = -movementX * this.panSpeed;
            const panY = movementY * this.panSpeed;

            const vector = new THREE.Vector3(panX, panY, 0);
            
            const worldQuat = new THREE.Quaternion();
            this.camera.getWorldQuaternion(worldQuat);
            vector.applyQuaternion(worldQuat);
            
            this.camera.position.add(vector);
        }
    };

    public setFocusTarget(target: THREE.Object3D | null, smooth = true, requestLock = true): void {
        this.focusTarget = target;
        console.log(`[CameraControls] setFocusTarget: ${target?.name ?? 'null'}, smooth: ${smooth}, lock: ${requestLock}`);
        if (target && smooth) {
            this.isEasingLookAt = true;
            
            // If smooth focusing, we likely want the mouse hidden during the transition 
            // and the user to be in "mouse-look" mode afterwards if it's a focus lock.
            if (requestLock) {
                this.domElement.requestPointerLock?.();
            }
        } else if (target && !smooth) {
            this.isEasingLookAt = false;
            
            const currentPos = new THREE.Vector3();
            const targetPos = new THREE.Vector3();
            this.camera.getWorldPosition(currentPos);
            target.getWorldPosition(targetPos);
            
            const m1 = new THREE.Matrix4();
            m1.lookAt(currentPos, targetPos, this.up);
            
            const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(m1);
            const parentWorldQuaternion = new THREE.Quaternion();
            this.cameraAnchor.getWorldQuaternion(parentWorldQuaternion);
            
            const targetQuaternion = parentWorldQuaternion.invert().multiply(worldQuaternion);
            this.camera.quaternion.copy(targetQuaternion);
            this.euler.setFromQuaternion(this.camera.quaternion);
        } else if (!target) {
            this.isEasingLookAt = false;
        }
    }

    public isAnchored(): boolean {
        // We consider it anchored if the anchor's parent is NOT the scene (meaning it's attached to an asset)
        // Check both null and type to be sure.
        return this.cameraAnchor.parent !== null && 
               this.cameraAnchor.parent.type !== 'Scene' && 
               this.cameraAnchor.parent.parent !== null; // The asset root is parented to the scene
    }

    public isMoving(): boolean {
        return this.keys.has('KeyW') || this.keys.has('KeyS') || this.keys.has('KeyA') || this.keys.has('KeyD');
    }

    public getDebugInfo(): {
        worldPosition: THREE.Vector3;
        worldRotation: THREE.Euler;
        zoom: number;
        frustum: { near: number; far: number; fov: number; aspect: number };
        isAnchored: boolean;
        anchorId?: string;
        relativePosition?: THREE.Vector3;
        relativeRotation?: THREE.Euler;
    } {
        const worldPos = new THREE.Vector3();
        this.camera.getWorldPosition(worldPos);

        const worldQuat = new THREE.Quaternion();
        this.camera.getWorldQuaternion(worldQuat);
        const worldRot = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');

        const info: any = {
            worldPosition: worldPos,
            worldRotation: worldRot,
            zoom: this.camera.zoom,
            frustum: {
                near: this.camera.near,
                far: this.camera.far,
                fov: this.camera.fov,
                aspect: this.camera.aspect,
            },
            isAnchored: this.isAnchored(),
        };

        if (info.isAnchored) {
            info.anchorId = this.cameraAnchor.parent?.name.replace('miris-asset:', '') ?? 'unknown';
            info.relativePosition = this.camera.position.clone();
            info.relativeRotation = this.camera.rotation.clone();
        }

        return info;
    }

    public setOnChange(callback: (() => void) | null): void {
        this.onChange = callback;
    }

    public setSideOffset(offset: number): void {
        this.targetSideOffset = offset;
    }

    public update(deltaTime: number): void {
        // Update side offset easing
        if (Math.abs(this.currentSideOffset - this.targetSideOffset) > 0.001) {
            // 0.5s easing -> roughly 2.0 speed if using linear lerp per second, 
            // but we'll use a smoother approach. 
            // For 0.5s duration, a simple lerp with 1 - exp(-speed * dt) works well.
            // factor 0.1 per frame at 60fps is ~0.1 * 60 = 6.0 per second.
            // To get ~95% completion in 0.5s: 1 - exp(-speed * 0.5) = 0.95 => exp(-0.5speed) = 0.05 => -0.5speed = ln(0.05) ≈ -3 => speed ≈ 6
            const speed = 6.0;
            this.currentSideOffset += (this.targetSideOffset - this.currentSideOffset) * (1 - Math.exp(-speed * deltaTime));
            
            // Apply offset to camera projection
            const width = this.domElement.clientWidth;
            const height = this.domElement.clientHeight;
            // setViewOffset(fullWidth, fullHeight, x, y, width, height)
            // We want to shift the "view" by currentSideOffset pixels.
            // Shifting the view to the right by X means the center of the scene moves to the left in the screen.
            // If the panel is on the right, we want the center to move LEFT.
            // So we shift the view to the RIGHT.
            this.camera.setViewOffset(width, height, this.currentSideOffset, 0, width, height);
        } else if (this.currentSideOffset !== this.targetSideOffset) {
            this.currentSideOffset = this.targetSideOffset;
            if (this.currentSideOffset === 0) {
                this.camera.clearViewOffset();
            } else {
                const width = this.domElement.clientWidth;
                const height = this.domElement.clientHeight;
                this.camera.setViewOffset(width, height, this.currentSideOffset, 0, width, height);
            }
        }

        if (this.isEasingLookAt && this.focusTarget) {
            // If user is trying to move or look manually, break the ease and the focus lock
            // We use a small threshold for mouse movement if pointer lock is active
            if (this.isMoving() || this.isPointerLocked) {
                console.log(`[CameraControls] breaking ease: isMoving=${this.isMoving()} isPointerLocked=${this.isPointerLocked}`);
                this.isEasingLookAt = false;
                this.focusTarget = null;
            }
        }

        if (this.isEasingLookAt && this.focusTarget) {
            const currentPos = new THREE.Vector3();
            const targetPos = new THREE.Vector3();
            this.camera.getWorldPosition(currentPos);
            this.focusTarget.getWorldPosition(targetPos);
            
            const m1 = new THREE.Matrix4();
            m1.lookAt(currentPos, targetPos, this.up);
            
            const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(m1);
            const parentWorldQuaternion = new THREE.Quaternion();
            this.cameraAnchor.getWorldQuaternion(parentWorldQuaternion);
            
            const targetQuaternion = parentWorldQuaternion.invert().multiply(worldQuaternion);
            
            this.camera.quaternion.slerp(targetQuaternion, 0.1);
            if (this.camera.quaternion.angleTo(targetQuaternion) < 0.01) {
                this.isEasingLookAt = false;
                this.euler.setFromQuaternion(this.camera.quaternion);
            }
        }

        const moveDistance = this.movementSpeed * deltaTime;
        const direction = new THREE.Vector3();

        if (this.keys.has('KeyW')) direction.z -= 1.0;
        if (this.keys.has('KeyS')) direction.z += 1.0;
        if (this.keys.has('KeyA')) direction.x -= 1.0;
        if (this.keys.has('KeyD')) direction.x += 1.0;

        if (direction.lengthSq() > 0) {
            direction.normalize();

            if (this.isAnchored()) {
                // When anchored, movement should be relative to the camera's orientation 
                // in LOCAL space (relative to the anchor).
                direction.applyQuaternion(this.camera.quaternion);
            } else {
                // When not anchored (world space), movement should be relative to 
                // the camera's FULL orientation in world space.
                const worldQuat = new THREE.Quaternion();
                this.camera.getWorldQuaternion(worldQuat);
                direction.applyQuaternion(worldQuat);
            }

            this.camera.position.addScaledVector(direction, moveDistance);
        }

        if (this.onChange && (!this.lastReportedPosition.equals(this.camera.position) || 
                              this.lastReportedQuaternion.angleTo(this.camera.quaternion) > 0.0001)) {
            this.lastReportedPosition.copy(this.camera.position);
            this.lastReportedQuaternion.copy(this.camera.quaternion);
            this.onChange();
        }
    }

    public getEuler(): THREE.Euler {
        return this.euler;
    }
}
