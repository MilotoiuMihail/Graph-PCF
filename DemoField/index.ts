import { IInputs, IOutputs } from "./generated/ManifestTypes";

interface GridMetrics {
    gridStart: number;
    gridEnd: number;
    gridSize: number;
    center: number;
    unitSize: number;
    gridStep: number;
    axisLimit: number;
    margin: number;
}

interface Circle {
    x: number,
    y: number,
    radius: number,
    outlineColor: string,
    fillColor: string | null,
    dashed: boolean,
    zIndex: number
}

export class DemoField implements ComponentFramework.StandardControl<IInputs, IOutputs> {

    private readonly DEFAULT_CANVAS_SIZE = 400;
    private readonly MIN_CANVAS_SIZE = 200;
    private readonly DEFAULT_AXIS_LIMIT = 1;

    private container: HTMLDivElement;
    private context: ComponentFramework.Context<IInputs>;
    private gridCanvas: HTMLCanvasElement;
    private gridCtx: CanvasRenderingContext2D;
    private circleCanvas: HTMLCanvasElement;
    private circleCtx: CanvasRenderingContext2D;
    private tooltip: HTMLDivElement;
    private tooltipTimeoutId: number | null = null;

    private jsonInput: string | null;
    private controlSize: number;
    private axisLimit: number;

    constructor() {
        //Empty
    }

    /**
     * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
     * Data-set values are not initialized here, use updateView.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
     * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
     * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
     * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.container = container;
        this.context = context;

        this.initializeCanvas();
        this.initializeTooltip();
        this.attachCanvasClickHandler();
    }

    /**
     * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
     */
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        // Add code to update control view
        this.context = context;

        const size = this.getControlSize();
        const axisLimit = this.getAxisLimit();
        const json = this.getJSON();

        let shouldRedrawGrid = false;

        if (this.controlSize !== size) {
            this.controlSize = size;
            this.setCanvasSize(size);
            shouldRedrawGrid = true;
        }

        if (this.axisLimit !== axisLimit) {
            this.axisLimit = axisLimit;
            shouldRedrawGrid = true;
        }

        if (this.jsonInput !== json) {
            this.jsonInput = json;
        }

        if (shouldRedrawGrid) {
            this.clearGridArea();
            this.drawGrid();
        }

        const circles = this.getCirclesFromJSON(json);
        this.clearCircleArea();
        this.drawWithClipping(() => this.drawCircles(circles));
    }

    /**
     * It is called by the framework prior to a control receiving new data.
     * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
     */
    public getOutputs(): IOutputs {
        return {};
    }

    /**
     * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
     * i.e. cancelling any pending remote calls, removing listeners, etc.
     */
    public destroy(): void {
        // Add code to cleanup control if necessary
    }

    private initializeCanvas(): void {
        this.container.style.position = "relative";
        this.gridCanvas = document.createElement("canvas");
        Object.assign(this.gridCanvas.style, {
            position: "absolute",
            border: "1px solid #000",
            left: "0",
            top: "0",
        });
        this.container.appendChild(this.gridCanvas);
        this.gridCtx = this.gridCanvas.getContext("2d")!;

        this.circleCanvas = document.createElement("canvas");
        Object.assign(this.circleCanvas.style, {
            position: "absolute",
            left: "0",
            top: "0",
            pointerEvents: "none",
        });
        this.container.appendChild(this.circleCanvas);
        this.circleCtx = this.circleCanvas.getContext("2d")!;
    }

    private getControlSize(): number {
        const rawSize = this.context.parameters.controlSize.raw || this.DEFAULT_CANVAS_SIZE;
        const size = Math.max(rawSize, this.MIN_CANVAS_SIZE);

        return size;
    }

    private setCanvasSize(size: number): void {
        this.gridCanvas.width = size;
        this.gridCanvas.height = size;
        this.circleCanvas.width = size;
        this.circleCanvas.height = size;
    }

    private initializeTooltip(): void {
        this.tooltip = document.createElement("div");

        Object.assign(this.tooltip.style, {
            position: "absolute",
            background: "rgba(0, 0, 0, 0.7)",
            color: "#fff",
            padding: "5px",
            borderRadius: "4px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 999,
            display: "none"
        });

        this.container.appendChild(this.tooltip);
    }

    private attachCanvasClickHandler(): void {
        this.gridCanvas.addEventListener("click", (event: MouseEvent) => {
            const x = event.offsetX;
            const y = event.offsetY;

            if (!this.isInsideGrid(x, y)) {
                this.tooltip.style.display = "none";
                return;
            }

            const coords = this.convertPixelToGrid(x, y);
            const coordText = `(x: ${coords.x.toFixed(2)}, y: ${coords.y.toFixed(2)})`;

            this.showTooltip(x + 10, y + 10, coordText);
            this.addTooltipHideOnMouseMove();
        });
    }

    private showTooltip(left: number, top: number, text: string): void {
        const { tooltip } = this;
        tooltip.innerText = text;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.display = "block";

        if (this.tooltipTimeoutId !== null) {
            clearTimeout(this.tooltipTimeoutId);
        }

        this.tooltipTimeoutId = window.setTimeout(() => {
            tooltip.style.display = "none";
            this.tooltipTimeoutId = null;
        }, 2000);
    }

    private addTooltipHideOnMouseMove() {
        const onMouseMove = () => {
            this.tooltip.style.display = "none";
            this.gridCanvas.removeEventListener("mousemove", onMouseMove);
        };

        this.gridCanvas.addEventListener("mousemove", onMouseMove);
    }

    private getAxisLimit(): number {
        return this.context.parameters.axisLimit.raw || this.DEFAULT_AXIS_LIMIT;
    }

    private getGridMetrics(): GridMetrics {
        const margin = 30;
        const canvasSize = this.gridCanvas.width;
        const axisLimit = this.axisLimit;

        // Compute usable area for grid
        const usableSize = canvasSize - 2 * margin;

        // Calculate how much space one unit can occupy
        const unitSizeRaw = usableSize / (axisLimit * 2);

        // Use the smaller to ensure it fits both directions
        const unitSize = Math.max(Math.floor(unitSizeRaw / 10) * 10, 10)

        const gridSize = unitSize * axisLimit * 2;

        const gridStart = (canvasSize - gridSize) * .5;
        const gridEnd = gridStart + gridSize;
        const center = gridStart + gridSize * .5;

        const gridStep = unitSize * .1;

        return {
            gridStart, gridEnd,
            gridSize,
            center,
            unitSize, gridStep,
            axisLimit,
            margin
        };
    }

    private isInsideGrid(x: number, y: number): boolean {
        const { gridStart, gridEnd } = this.getGridMetrics();
        return (
            x >= gridStart &&
            x <= gridEnd &&
            y >= gridStart &&
            y <= gridEnd
        );
    }

    private convertPixelToGrid(pixelX: number, pixelY: number): { x: number; y: number } {
        const { center, unitSize } = this.getGridMetrics();

        const gridX = (pixelX - center) / unitSize;
        const gridY = (center - pixelY) / unitSize;

        return { x: gridX, y: gridY };
    }

    private convertGridToPixel(gridX: number, gridY: number): { x: number; y: number } {
        const { center, unitSize } = this.getGridMetrics();

        const x = center + gridX * unitSize;
        const y = center - gridY * unitSize;

        return { x, y };
    }

    private clearGridArea(): void {
        this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
    }

    private clearCircleArea(): void {
        this.circleCtx.clearRect(0, 0, this.circleCanvas.width, this.circleCanvas.height);
    }


    private drawGrid(): void {
        this.drawGridLines();
        this.drawAxes();
        this.drawLabels();
    }

    private drawGridLines(): void {
        const { gridStart, gridEnd, gridSize, unitSize, gridStep } = this.getGridMetrics();

        const halfUnitSize = unitSize * .5;

        this.gridCtx.lineWidth = 1;

        let xPos = 0;
        for (let x = 0; x <= gridSize; x += gridStep) {
            xPos = gridStart + x + .5;
            this.gridCtx.beginPath();
            this.gridCtx.setLineDash(x % halfUnitSize === 0 ? [] : [1, 1]);
            this.gridCtx.moveTo(xPos, gridStart);
            this.gridCtx.lineTo(xPos, gridEnd);
            this.gridCtx.stroke();
        }

        let yPos = 0;
        for (let y = 0; y <= gridSize; y += gridStep) {
            yPos = gridStart + y + .5;
            this.gridCtx.beginPath();
            this.gridCtx.setLineDash(y % halfUnitSize === 0 ? [] : [1, 1]);
            this.gridCtx.moveTo(gridStart, yPos);
            this.gridCtx.lineTo(gridEnd, yPos);
            this.gridCtx.stroke();
        }
    }

    private drawAxes(): void {
        const { gridStart, gridEnd, center } = this.getGridMetrics();

        this.gridCtx.setLineDash([]);
        this.gridCtx.strokeStyle = "#000";
        this.gridCtx.lineWidth = 2;

        this.gridCtx.beginPath();
        this.gridCtx.moveTo(gridStart, center);
        this.gridCtx.lineTo(gridEnd, center);
        this.gridCtx.stroke();

        this.gridCtx.beginPath();
        this.gridCtx.moveTo(center, gridEnd);
        this.gridCtx.lineTo(center, gridStart);
        this.gridCtx.stroke();
    }

    private drawLabels(): void {
        const { center, gridStart, gridEnd, unitSize, axisLimit } = this.getGridMetrics();

        const fontSize = 10;
        this.gridCtx.font = `${fontSize}px sans-serif`;
        this.gridCtx.textAlign = "left";
        this.gridCtx.textBaseline = "middle";
        this.gridCtx.fillStyle = "#000";

        // X-axis labels
        for (let i = -axisLimit; i <= axisLimit; i += .5) {
            const x = center + i * unitSize;
            this.gridCtx.save();
            this.gridCtx.translate(x, gridStart - 5);
            this.gridCtx.rotate(-Math.PI * .5);
            this.gridCtx.fillText(i.toFixed(2), 0, 0);
            this.gridCtx.restore();
        }

        // Y-axis labels
        for (let j = -axisLimit; j <= axisLimit; j += 0.5) {
            const y = center - j * unitSize;
            this.gridCtx.fillText(j.toFixed(2), gridEnd + 5, y);
        }
    }

    private drawWithClipping(drawFn: () => void) {
        const { gridStart, gridSize } = this.getGridMetrics();

        this.circleCtx.save();
        this.circleCtx.beginPath();
        this.circleCtx.rect(gridStart, gridStart, gridSize, gridSize);
        this.circleCtx.clip();

        drawFn();

        this.circleCtx.restore();
    }

    private drawCircle(circle: Circle): void {
        const { x, y, radius, outlineColor, fillColor, dashed } = circle;
        const { unitSize } = this.getGridMetrics();
        const { circleCtx: ctx } = this;

        const { x: canvasX, y: canvasY } = this.convertGridToPixel(x, y);

        //outer circle
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = outlineColor;
        ctx.setLineDash(dashed ? [5, 3] : []);
        ctx.arc(canvasX, canvasY, radius * unitSize, 0, Math.PI * 2);

        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();

        }
        ctx.stroke();
    }

    private drawCircles(circles: Circle[]) {
        const sortedCircles = [...circles].sort((a, b) => a.zIndex - b.zIndex);

        for (const circle of sortedCircles) {
            this.drawCircle(circle)
        }
    }

    private getJSON(): string | null {
        return this.context.parameters.jsonInput.raw;
    }

    private getCirclesFromJSON(json: string | null): Circle[] {
        if (!json) {
            return [];
        }

        try {
            const parsed: Circle[] = JSON.parse(json);
            return parsed;
        } catch (e) {
            console.error("Invalid JSON in circleData:", e);
            return [];
        }
    }
}
