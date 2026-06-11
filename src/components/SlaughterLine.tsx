16:11:23.760 Running build in Washington, D.C., USA (East) – iad1 (Enhanced Build Machine)
16:11:23.761 Build machine configuration: 8 cores, 16 GB
16:11:23.889 Cloning github.com/Ogilvie1978/slagteri-sim (Branch: main, Commit: 70f7dff)
16:11:24.144 Cloning completed: 255.000ms
16:11:25.380 Restored build cache from previous deployment (38T76dzfpGK7srTbbqpmCexfHMa3)
16:11:25.604 Running "vercel build"
16:11:25.619 Vercel CLI 54.10.2
16:11:25.858 Installing dependencies...
16:11:29.921 
16:11:29.921 up to date in 4s
16:11:29.921 
16:11:29.921 153 packages are looking for funding
16:11:29.921   run `npm fund` for details
16:11:29.959 Detected Next.js version: 14.2.5
16:11:29.966 Running "npm run build"
16:11:30.080 
16:11:30.081 > slagteri-sim@0.1.0 build
16:11:30.081 > next build
16:11:30.081 
16:11:30.784   ▲ Next.js 14.2.5
16:11:30.784 
16:11:30.801    Creating an optimized production build ...
16:11:38.619  ✓ Compiled successfully
16:11:38.620    Linting and checking validity of types ...
16:11:42.066 Failed to compile.
16:11:42.067 
16:11:42.067 ./src/app/production/page.tsx:422:13
16:11:42.067 Type error: Type '(animal: StableAnimal, basePrice: number) => Promise<void>' is not assignable to type '(animal: Animal, basePrice: number) => Promise<void>'.
16:11:42.067   Types of parameters 'animal' and 'animal' are incompatible.
16:11:42.067     Type 'Animal' is missing the following properties from type 'StableAnimal': arrived_week, arrived_day, arrived_at, health_status, vet_checked
16:11:42.067 
16:11:42.067   420 |             readyAnimals={readyForSlaughter}
16:11:42.067   421 |             company={company}
16:11:42.068 > 422 |             onSlaughter={slaughterAnimal}
16:11:42.068       |             ^
16:11:42.068   423 |             processing={processing}
16:11:42.068   424 |           />
16:11:42.068   425 |         )}
16:11:42.122 Error: Command "npm run build" exited with 1
