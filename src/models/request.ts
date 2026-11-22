import { FlameHeight } from './flameHeight';
import { OperationMode } from './operationMode';

export interface IRequest {
    height?: FlameHeight;
    mode?: OperationMode;
    allowIgnition?: boolean;
    temperature?: number;
    auxOn?: boolean;
}
