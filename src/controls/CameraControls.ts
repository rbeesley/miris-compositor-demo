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
    private readonly up = new THREE.Vector3(0, 1, 0);

    private isPointerLocked = false;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, cameraAnchor: THREE.Object3D) {
        this.camera = camera;
        this.cameraAnchor = cameraAnchor;
        this.domElement = domElement;

        this.euler.setFromQuaternion(camera.quaternion);

        this.addEventListeners();
    }

    private addEventListeners(): void {
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        this.domElement.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('wheel', this.onWheel, { passive: false });
        // Prevent context menu to allow right-click panning
        this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === this.domElement;
        });
    }

    public dispose(): void {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        this.domElement.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('wheel', this.onWheel);
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
            // Zoom should be relative to camera's orientation in LOCAL space
            direction.applyQuaternion(this.camera.quaternion);
        } else {
            // Zoom should be relative to camera's orientation in WORLD space.
            const worldQuat = new THREE.Quaternion();
            this.camera.getWorldQuaternion(worldQuat);
            direction.applyQuaternion(worldQuat);
        }
        
        this.camera.position.addScaledVector(direction, this.zoomSpeed);
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
            
            if (this.isAnchored()) {
                // When anchored, panning should be relative to camera's orientation in LOCAL space
                vector.applyQuaternion(this.camera.quaternion);
            } else {
                // When not anchored, panning should be relative to camera's orientation in WORLD space
                const worldQuat = new THREE.Quaternion();
                this.camera.getWorldQuaternion(worldQuat);
                vector.applyQuaternion(worldQuat);
            }
            
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
        // Note: This requires access to the scene, or checking if parent is null or something else.
        // A better way is to check if it has a parent that is an Object3D but not the scene.
        // However, CameraControls doesn't have a direct reference to the scene object.
        // We can check if it has a parent at all, but the scene itself is usually the parent in world space.
        // In this project, the compositor attaches the anchor to the scene by default.
        // Let's look at compositor.ts again.
        return this.cameraAnchor.parent !== null && this.cameraAnchor.parent.type !== 'Scene';
    }

    public isMoving(): boolean {
        return this.keys.has('KeyW') || this.keys.has('KeyS') || this.keys.has('KeyA') || this.keys.has('KeyD');
    }

    public getFocusTarget(): THREE.Object3D | null {
        return this.focusTarget;
    }

    public update(deltaTime: number): void {
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
    }
}
