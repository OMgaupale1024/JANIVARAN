declare module 'react-simple-maps' {
    import * as React from 'react';

    export interface ProjectionConfig {
        scale?: number;
        center?: [number, number];
        rotate?: [number, number, number];
        parallels?: [number, number];
    }

    export interface ComposableMapProps {
        width?: number;
        height?: number;
        projection?: string | ((width: number, height: number, config: ProjectionConfig) => unknown);
        projectionConfig?: ProjectionConfig;
        className?: string;
        style?: React.CSSProperties;
        children?: React.ReactNode;
    }

    export class ComposableMap extends React.Component<ComposableMapProps> { }

    export interface GeographiesProps {
        geography?: string | Record<string, unknown> | string[];
        children?: (args: { geographies: Geo[]; projection: unknown; path: unknown }) => React.ReactNode;
    }

    export type Geo = Record<string, unknown> & { rsmKey: string };

    export class Geographies extends React.Component<GeographiesProps> { }

    export interface GeographyProps {
        geography?: Geo;
        key?: string | number;
        onMouseEnter?: (event: React.MouseEvent) => void;
        onMouseLeave?: (event: React.MouseEvent) => void;
        onMouseDown?: (event: React.MouseEvent) => void;
        onMouseUp?: (event: React.MouseEvent) => void;
        onClick?: (event: React.MouseEvent) => void;
        style?: {
            default?: React.CSSProperties;
            hover?: React.CSSProperties;
            pressed?: React.CSSProperties;
        };
        [key: string]: unknown;
    }

    export class Geography extends React.Component<GeographyProps> { }
}
