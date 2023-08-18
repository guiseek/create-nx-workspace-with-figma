function isNxPlugin<T extends SceneNode>(node: T) {
  return node.name === '@nx' && node.type === 'INSTANCE'
}

function isRepoScope<T extends SceneNode>(node: T) {
  return node.type === 'SECTION'
}

function isTextNode<T extends SceneNode>(node: T) {
  return node.type === 'TEXT'
}

function getMetadata<T extends TextNode>(nodes: T[]) {
  const chars = nodes.map((node) => node.characters)
  const [plugin, collection, name, libraryType] = chars
  return {plugin, collection, name, libraryType}
}

function findScopesOnPage<R extends SectionNode>(page: PageNode) {
  return page.children.filter(isRepoScope) as R[]
}

function findAppsOnPage<R extends InstanceNode>(page: PageNode) {
  return page.children.filter(isNxPlugin).filter((child: InstanceNode) => {
    const {collection} = child.variantProperties
    return collection === 'application'
  }) as R[]
}

function findLibTextNodes(libs: InstanceNode) {
  const frame = libs.children[0] as FrameNode
  return frame.children.filter(isTextNode) as TextNode[]
}

function findLibsOnScope(scope: SectionNode) {
  return scope.children.filter(isNxPlugin).filter((child: InstanceNode) => {
    const {collection} = child.variantProperties
    return collection === 'library'
  }) as InstanceNode[]
}

const plugins = {
  server: ['@nx/nest', '@nx/express', '@nx/node'],
  client: ['@nx/angular', '@nx/react', '@nx/web', '@nx/vite'],
}

function createApps() {
  const commands: string[] = []
  const install: string[] = []

  findAppsOnPage(figma.currentPage).map((app) => {
    const {name, plugin, collection} = getMetadata(findLibTextNodes(app))

    let cmd = `npx nx generate ${plugin}:${collection} ${name}`

    cmd += ` --e2eTestRunner=none`

    if (plugin === '@nx/angular') {
      cmd += ` --style=scss`
      cmd += ` --routing`
    }

    cmd += ` --tags=type:app`

    if (plugins.client.indexOf(plugin) > -1) {
      cmd += `,side:client`
    }
    if (plugins.server.indexOf(plugin) > -1) {
      cmd += `,side:server`
    }

    cmd += ` --no-interactive`

    install.push(plugin)
    commands.push(cmd)
  })

  return {commands, install}
}

function createLibs(scope: SectionNode) {
  const commands: string[] = []
  const install: string[] = []

  findLibsOnScope(scope).map((lib) => {
    const {name, plugin, libraryType, collection} = getMetadata(
      findLibTextNodes(lib),
    )

    let cmd

    if (name.length) {
      cmd = `npx nx generate ${plugin}:${collection} ${libraryType}-${name}`
    } else {
      cmd = `npx nx generate ${plugin}:${collection} ${libraryType}`
    }

    if (plugin === '@nx/js') {
      cmd += ` --bundler=tsc`
      cmd += ` --unitTestRunner=jest`

      if (name === 'domain') {
        cmd += ` --testEnvironment=jsdom`
      }
    }

    cmd += ` --directory=${scope.name}`

    cmd += ` --tags=type:${libraryType},scope:${scope.name}`

    if (plugin === '@nx/angular') {
      cmd += ` --style=scss`

      if (libraryType === 'feature') {
        cmd += ` --routing \n`

        cmd += `npx nx generate @nx/angular:component ${scope.name}-${libraryType}-${name}`
        cmd += ` --flat --project=${scope.name}-${libraryType}-${name}`
      }
    }

    if (plugin === '@nx/nest') {
      cmd += `\n`
      if (libraryType === 'resource') {
        cmd += `npm i @nestjs/mapped-types \n`
        cmd += `rm libs/${scope.name}/${libraryType}-${name}/src/lib/${scope.name}-${libraryType}-${name}.module.ts \n`
        cmd += `npx nx generate @nx/nest:resource --name=${scope.name}-${libraryType}-${name} --type=rest --crud`
        cmd += ` --project=${scope.name}-${libraryType}-${name}`
        cmd += ` --path=lib --flat`
      }
    }

    cmd += ` --no-interactive`

    install.push(plugin)
    commands.push(cmd)
  })

  return {commands, install}
}

figma.on('run', async () => {
  const projects = createApps()

  findScopesOnPage(figma.currentPage)
    .map(createLibs)
    .map(({commands, install}) => {
      projects.commands.push(...commands)
      projects.install.push(...install)
    })

  const plugins = [...new Set(projects.install)]

  const stylesheet = `
  <style>
  pre {
    color: #111;
    padding: 8px;
    display: block;
    font-size: 13px;
    border-radius: 8px;
    background: #f1f1f1;
    white-space: pre-line;
  }
  </style>`
  const npmInstall = `<pre>${`npm i -D ` + plugins.join(' ')}</pre>`
  const nxCommands = projects.commands.map((cmd) => `<pre>${cmd}</pre>`).join('')
  const template = stylesheet + npmInstall + nxCommands
  figma.showUI(template, {visible: true, width: 1260, height: 620})
})


figma.ui.onmessage = (message, props) => {
  console.log(props.origin)
  console.log(message)
}
